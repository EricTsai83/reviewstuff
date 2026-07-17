import * as Effect from "effect/Effect";
import type {
  ReviewFileSource,
  ReviewSkippedFile,
} from "../domain/review-file";
import * as CommandRunner from "../platform/command-runner";
import * as FileInspector from "../platform/file-inspector";
import {
  GitChangedFileUnavailableError,
  GitExecutionError,
  GitInvalidOutputError,
  makeGitCommandError,
  mapCommandExecutionError,
  type GitError,
} from "./git-errors";

const commandTimeoutMilliseconds = 10_000;
const defaultMaxOutputBytes = 4 * 1024 * 1024;
const patchMaxOutputBytes = 512 * 1024;
const reviewableFileMaxBytes = BigInt(patchMaxOutputBytes);
const objectMetadataMaxOutputBytes = 1_024;
const patchCollectionConcurrency = 4;
const isObjectId = (value: string): boolean =>
  /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);

export interface GitFilePatch {
  readonly path: string;
  readonly patch: string;
  readonly source: ReviewFileSource;
}

export type GitSkippedFile = ReviewSkippedFile;

export interface GitDiff {
  readonly files: ReadonlyArray<GitFilePatch>;
  readonly skippedFiles: ReadonlyArray<GitSkippedFile>;
}

export type GitChangeStatus = "A" | "B" | "C" | "D" | "M" | "R" | "T" | "U" | "X";

export interface GitPatchTarget {
  readonly path: string;
  readonly pathspecs: ReadonlyArray<string>;
}

export interface GitChangedPath extends GitPatchTarget {
  readonly status: GitChangeStatus;
  readonly score?: number;
}

export const executeGit = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  maxOutputBytes: number,
  workingDirectory?: string,
) =>
  runner
    .run({
      program: "git",
      args: ["--literal-pathspecs", ...args],
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
      environment: { LC_ALL: "C" },
      timeout: commandTimeoutMilliseconds,
      maxOutputBytes,
    })
    .pipe(
      Effect.mapError((cause) => mapCommandExecutionError(operation, cause)),
    );

export const requireGitSuccess = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  workingDirectory?: string,
) =>
  executeGit(runner, operation, args, defaultMaxOutputBytes, workingDirectory).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout)
        : Effect.fail(makeGitCommandError(operation, result)),
    ),
  );

export const resolveEmptyTree = (
  runner: CommandRunner.Service,
  repositoryRoot: string,
): Effect.Effect<string, GitError> => {
  const operation = "resolve empty tree";

  return requireGitSuccess(
    runner,
    operation,
    ["hash-object", "-t", "tree", "/dev/null"],
    repositoryRoot,
  ).pipe(
    Effect.flatMap((output) => {
      const objectId = output.trim();

      return isObjectId(objectId)
        ? Effect.succeed(objectId)
        : Effect.fail(
            new GitInvalidOutputError({
              operation,
              outputBytes: Buffer.byteLength(output),
            }),
          );
    }),
  );
};

const invalidOutput = (
  operation: string,
  output: string,
): GitInvalidOutputError =>
  new GitInvalidOutputError({
    operation,
    outputBytes: Buffer.byteLength(output),
  });

const nulSeparatedFields = (
  output: string,
  operation: string,
): Effect.Effect<ReadonlyArray<string>, GitInvalidOutputError> => {
  if (output.length === 0) {
    return Effect.succeed([]);
  }

  if (!output.endsWith("\0")) {
    return Effect.fail(invalidOutput(operation, output));
  }

  const fields = output.split("\0");
  fields.pop();

  return fields.some((field) => field.length === 0)
    ? Effect.fail(invalidOutput(operation, output))
    : Effect.succeed(fields);
};

export const nulSeparatedPaths = (
  output: string,
  operation: string,
): Effect.Effect<ReadonlyArray<string>, GitInvalidOutputError> =>
  nulSeparatedFields(output, operation).pipe(
    Effect.map((paths) =>
      [...paths].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0
      )
    ),
  );

const parseChangeStatus = (
  value: string,
): { readonly status: GitChangeStatus; readonly score?: number } | undefined => {
  if (!/^(?:[ABCDTUX]|M(?:\d{3})?|[RC]\d{3})$/.test(value)) {
    return undefined;
  }

  const score = value.length === 4 ? Number(value.slice(1)) : undefined;
  if (score !== undefined && score > 100) {
    return undefined;
  }

  const status = value[0] as GitChangeStatus;
  return score === undefined ? { status } : { status, score };
};

export const nulSeparatedChangedPaths = (
  output: string,
  operation: string,
): Effect.Effect<ReadonlyArray<GitChangedPath>, GitInvalidOutputError> =>
  nulSeparatedFields(output, operation).pipe(
    Effect.flatMap((fields) => {
      const changes: Array<GitChangedPath> = [];

      for (let index = 0; index < fields.length;) {
        const rawStatus = fields[index];
        const parsedStatus = rawStatus === undefined
          ? undefined
          : parseChangeStatus(rawStatus);
        const sourcePath = fields[index + 1];

        if (parsedStatus === undefined || sourcePath === undefined) {
          return Effect.fail(invalidOutput(operation, output));
        }

        if (parsedStatus.status === "R" || parsedStatus.status === "C") {
          const targetPath = fields[index + 2];
          if (targetPath === undefined) {
            return Effect.fail(invalidOutput(operation, output));
          }

          changes.push({
            ...parsedStatus,
            path: targetPath,
            pathspecs: [sourcePath, targetPath],
          });
          index += 3;
          continue;
        }

        changes.push({
          ...parsedStatus,
          path: sourcePath,
          pathspecs: [sourcePath],
        });
        index += 2;
      }

      return Effect.succeed(
        changes.sort((left, right) =>
          left.path < right.path ? -1 : left.path > right.path ? 1 : 0
        ),
      );
    }),
  );

export const unmergedPaths = (
  changes: ReadonlyArray<GitChangedPath>,
): ReadonlyArray<string> =>
  [...new Set(
    changes
      .filter((change) => change.status === "U")
      .map((change) => change.path),
  )].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

export const mergeChangedPaths = (
  changes: ReadonlyArray<GitChangedPath>,
): ReadonlyArray<GitPatchTarget> => {
  const merged = new Map<string, Set<string>>();

  for (const change of changes) {
    const pathspecs = merged.get(change.path) ?? new Set<string>();

    for (const pathspec of change.pathspecs) {
      pathspecs.add(pathspec);
    }

    merged.set(change.path, pathspecs);
  }

  return [...merged.entries()]
    .map(([path, pathspecs]) => ({ path, pathspecs: [...pathspecs].sort() }))
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    );
};

const isBinaryPatch = (patch: string): boolean =>
  patch.split("\n").some((line) =>
    line.startsWith("Binary files ") || line === "GIT binary patch"
  );

const readObjectSize = (
  runner: CommandRunner.Service,
  object: string,
  workingDirectory: string,
): Effect.Effect<bigint | undefined, GitError> => {
  const resolveObjectOperation = "resolve git object";
  const inspectObjectOperation = "inspect git object";

  return executeGit(
    runner,
    resolveObjectOperation,
    ["rev-parse", "--verify", "--quiet", object],
    objectMetadataMaxOutputBytes,
    workingDirectory,
  ).pipe(
    Effect.flatMap(
      (result): Effect.Effect<bigint | undefined, GitError> => {
        if (result.exitCode === 1) {
          return Effect.succeed<undefined>(undefined);
        }

        if (result.exitCode !== 0) {
          return Effect.fail(
            makeGitCommandError(resolveObjectOperation, result),
          );
        }

        const objectId = result.stdout.trim();

        if (!isObjectId(objectId)) {
          return Effect.fail(
            new GitInvalidOutputError({
              operation: resolveObjectOperation,
              outputBytes: Buffer.byteLength(result.stdout),
            }),
          );
        }

        return executeGit(
          runner,
          inspectObjectOperation,
          ["cat-file", "-s", objectId],
          objectMetadataMaxOutputBytes,
          workingDirectory,
        ).pipe(
          Effect.flatMap((sizeResult): Effect.Effect<bigint, GitError> => {
            if (sizeResult.exitCode !== 0) {
              return Effect.fail(
                makeGitCommandError(inspectObjectOperation, sizeResult),
              );
            }

            const size = sizeResult.stdout.trim();

            return /^\d+$/.test(size)
              ? Effect.succeed(BigInt(size))
              : Effect.fail(
                  new GitInvalidOutputError({
                    operation: inspectObjectOperation,
                    outputBytes: Buffer.byteLength(sizeResult.stdout),
                  }),
                );
          }),
        );
      },
    ),
  );
};

const readChangedFileSize = (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  path: string,
  source: GitFilePatch["source"],
  repositoryRoot: string,
): Effect.Effect<bigint | undefined, GitError> => {
  if (source === "staged") {
    return readObjectSize(runner, `:./${path}`, repositoryRoot).pipe(
      Effect.flatMap((size) =>
        size === undefined
          ? readObjectSize(runner, `HEAD:${path}`, repositoryRoot)
          : Effect.succeed(size),
      ),
    );
  }

  return inspector.size(path, repositoryRoot).pipe(
    Effect.mapError(
      (cause) =>
        new GitExecutionError({
          operation: "inspect changed file",
          failure: "file-inspection",
          cause,
        }),
    ),
    Effect.flatMap((size) => {
      if (size !== undefined) {
        return Effect.succeed(size);
      }

      if (source === "untracked") {
        return Effect.succeed<undefined>(undefined);
      }

      return readObjectSize(runner, `HEAD:${path}`, repositoryRoot).pipe(
        Effect.flatMap((headSize) =>
          headSize === undefined
            ? readObjectSize(runner, `:./${path}`, repositoryRoot)
            : Effect.succeed(headSize),
        ),
      );
    }),
  );
};

const readPatch = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  path: string,
  source: GitFilePatch["source"],
  expectedExitCodes: ReadonlySet<number>,
  workingDirectory: string,
): Effect.Effect<GitFilePatch | GitSkippedFile, GitError> =>
  executeGit(runner, operation, args, patchMaxOutputBytes, workingDirectory).pipe(
    Effect.flatMap(
      (
        result,
      ): Effect.Effect<GitFilePatch | GitSkippedFile, GitError> => {
        if (!expectedExitCodes.has(result.exitCode)) {
          return Effect.fail(makeGitCommandError(operation, result));
        }

        if (result.stdout.length === 0) {
          return Effect.fail(
            new GitChangedFileUnavailableError({ path, source }),
          );
        }

        return Effect.succeed<GitFilePatch | GitSkippedFile>(
          isBinaryPatch(result.stdout)
            ? { path, source, reason: "binary" }
            : { path, patch: result.stdout, source },
        );
      },
    ),
  );

export interface GitPatchCollection {
  readonly files: ReadonlyArray<GitFilePatch>;
  readonly skippedFiles: ReadonlyArray<GitSkippedFile>;
}

export const collectPatches = (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  changes: ReadonlyArray<GitPatchTarget>,
  kind: GitFilePatch["source"],
  repositoryRoot: string,
  base: string = "HEAD",
): Effect.Effect<GitPatchCollection, GitError> =>
  Effect.forEach(changes, ({ path, pathspecs }) =>
    readChangedFileSize(runner, inspector, path, kind, repositoryRoot).pipe(
      Effect.flatMap((size) => {
        if (size === undefined && kind === "untracked") {
          return Effect.fail(
            new GitChangedFileUnavailableError({ path, source: kind }),
          );
        }

        if (size !== undefined && size > reviewableFileMaxBytes) {
          return Effect.succeed<GitSkippedFile>({
            path,
            source: kind,
            reason: "file-too-large",
            sizeBytes: size.toString(),
            limitBytes: patchMaxOutputBytes,
          });
        }

        if (kind === "untracked") {
          return readPatch(
            runner,
            "read untracked diff",
            [
              "diff",
              "--no-index",
              "--no-color",
              "--no-ext-diff",
              "--",
              "/dev/null",
              path,
            ],
            path,
            kind,
            new Set([0, 1]),
            repositoryRoot,
          );
        }

        const diffTarget = kind === "staged" ? ["--cached"] : [base];

        return readPatch(
          runner,
          `read ${kind} diff`,
          [
            "diff",
            ...diffTarget,
            "--find-renames",
            "--no-color",
            "--no-ext-diff",
            "--unified=3",
            "--",
            ...pathspecs,
          ],
          path,
          kind,
          new Set([0]),
          repositoryRoot,
        );
      }),
    ),
    { concurrency: patchCollectionConcurrency },
  ).pipe(
    Effect.map((results) => ({
      files: results.filter(
        (result): result is GitFilePatch => "patch" in result,
      ),
      skippedFiles: results.filter(
        (result): result is GitSkippedFile => "reason" in result,
      ),
    })),
  );
