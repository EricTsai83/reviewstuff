import { Context, Data, Effect, Layer } from "effect";
import type { ReviewScope } from "../domain/scope";
import * as CommandRunner from "../platform/command-runner";
import * as FileInspector from "../platform/file-inspector";

const commandTimeout = "10 seconds";
const listOutputLimit = 4 * 1024 * 1024;
const patchOutputLimit = 512 * 1024;
const fileSizeLimit = BigInt(patchOutputLimit);
const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface GitFilePatch {
  readonly path: string;
  readonly patch: string;
  readonly source: "staged" | "working-tree" | "untracked";
}

export interface GitDiff {
  readonly files: ReadonlyArray<GitFilePatch>;
}

interface GitChangedPath {
  readonly path: string;
  readonly pathspecs: ReadonlyArray<string>;
}

export class GitNotRepositoryError extends Data.TaggedError(
  "GitNotRepositoryError",
)<{}> {}

export class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly operation: string;
  readonly exitCode: number;
  readonly stderrLength: number;
}> {}

export class GitExecutionError extends Data.TaggedError("GitExecutionError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export type GitError =
  | GitNotRepositoryError
  | GitCommandError
  | GitExecutionError;

export class GitService extends Context.Tag("reviewstuff/GitService")<
  GitService,
  {
    readonly readDiff: (
      scope: ReviewScope,
    ) => Effect.Effect<GitDiff, GitError>;
  }
>() {}

const execute = (
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
      timeout: commandTimeout,
      maxOutputBytes,
    })
    .pipe(
      Effect.mapError(
        (cause) => new GitExecutionError({ operation, cause }),
      ),
    );

const requireSuccess = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  workingDirectory?: string,
) =>
  execute(runner, operation, args, listOutputLimit, workingDirectory).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout)
        : Effect.fail(
            new GitCommandError({
              operation,
              exitCode: result.exitCode,
              stderrLength: result.stderr.length,
            }),
          ),
    ),
  );

const nulSeparatedPaths = (output: string): ReadonlyArray<string> =>
  output
    .split("\0")
    .filter((path) => path.length > 0)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

const nulSeparatedChangedPaths = (
  output: string,
): ReadonlyArray<GitChangedPath> => {
  const fields = output.split("\0");
  const changes: Array<GitChangedPath> = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index];

    if (status === undefined || status.length === 0) {
      break;
    }

    const sourcePath = fields[index + 1];

    if (sourcePath === undefined) {
      break;
    }

    if (status.startsWith("R") || status.startsWith("C")) {
      const targetPath = fields[index + 2];

      if (targetPath === undefined) {
        break;
      }

      changes.push({
        path: targetPath,
        pathspecs: [sourcePath, targetPath],
      });
      index += 3;
      continue;
    }

    changes.push({ path: sourcePath, pathspecs: [sourcePath] });
    index += 2;
  }

  return changes.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
};

const mergeChangedPaths = (
  changes: ReadonlyArray<GitChangedPath>,
): ReadonlyArray<GitChangedPath> => {
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
): Effect.Effect<bigint | undefined, GitError> =>
  execute(
    runner,
    "inspect git object",
    ["cat-file", "-s", object],
    1_024,
    workingDirectory,
  ).pipe(
    Effect.flatMap((result) => {
      if (result.exitCode !== 0) {
        return Effect.succeed<undefined>(undefined);
      }

      const size = result.stdout.trim();

      return /^\d+$/.test(size)
        ? Effect.succeed(BigInt(size))
        : Effect.fail(
            new GitCommandError({
              operation: "inspect git object",
              exitCode: result.exitCode,
              stderrLength: result.stderr.length,
            }),
          );
    }),
  );

const withinFileSizeLimit = (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  path: string,
  source: GitFilePatch["source"],
  repositoryRoot: string,
): Effect.Effect<boolean, GitError> => {
  if (source === "staged") {
    return readObjectSize(runner, `:./${path}`, repositoryRoot).pipe(
      Effect.flatMap((size) =>
        size === undefined
          ? readObjectSize(runner, `HEAD:${path}`, repositoryRoot)
          : Effect.succeed(size),
      ),
      Effect.map((size) => size === undefined || size <= fileSizeLimit),
    );
  }

  return inspector.size(path, repositoryRoot).pipe(
    Effect.mapError(
      (cause) =>
        new GitExecutionError({ operation: "inspect changed file", cause }),
    ),
    Effect.flatMap((size) => {
      if (size !== undefined) {
        return Effect.succeed(size <= fileSizeLimit);
      }

      if (source === "untracked") {
        return Effect.succeed(false);
      }

      return readObjectSize(runner, `HEAD:${path}`, repositoryRoot).pipe(
        Effect.flatMap((headSize) =>
          headSize === undefined
            ? readObjectSize(runner, `:./${path}`, repositoryRoot)
            : Effect.succeed(headSize),
        ),
        Effect.map((trackedSize) =>
          trackedSize === undefined || trackedSize <= fileSizeLimit,
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
): Effect.Effect<GitFilePatch | undefined, GitError> =>
  runner
    .run({
      program: "git",
      args: ["--literal-pathspecs", ...args],
      workingDirectory,
      timeout: commandTimeout,
      maxOutputBytes: patchOutputLimit,
    })
    .pipe(
      Effect.mapError((cause) =>
        cause instanceof CommandRunner.CommandOutputLimitError
          ? cause
          : new GitExecutionError({ operation, cause }),
      ),
      Effect.flatMap((result) => {
        if (!expectedExitCodes.has(result.exitCode)) {
          return Effect.fail(
            new GitCommandError({
              operation,
              exitCode: result.exitCode,
              stderrLength: result.stderr.length,
            }),
          );
        }

        return Effect.succeed(
          result.stdout.length === 0 || isBinaryPatch(result.stdout)
            ? undefined
            : { path, patch: result.stdout, source },
        );
      }),
      Effect.catchTag("CommandOutputLimitError", () =>
        Effect.succeed<undefined>(undefined),
      ),
    );

const collectPatches = (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  changes: ReadonlyArray<GitChangedPath>,
  kind: GitFilePatch["source"],
  repositoryRoot: string,
  base: string = "HEAD",
): Effect.Effect<ReadonlyArray<GitFilePatch>, GitError> =>
  Effect.forEach(changes, ({ path, pathspecs }) =>
    withinFileSizeLimit(runner, inspector, path, kind, repositoryRoot).pipe(
      Effect.flatMap((withinLimit) => {
        if (!withinLimit) {
          return Effect.succeed<undefined>(undefined);
        }

        if (kind === "untracked") {
          return readPatch(
            runner,
            "read untracked diff",
            ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", "/dev/null", path],
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
  ).pipe(
    Effect.map((patches) =>
      patches.filter((patch): patch is GitFilePatch => patch !== undefined),
    ),
  );

const readDiff = (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  scope: ReviewScope,
): Effect.Effect<GitDiff, GitError> =>
  Effect.gen(function* () {
    const repositoryCheck = yield* execute(
      runner,
      "detect git repository",
      ["rev-parse", "--is-inside-work-tree"],
      listOutputLimit,
    );

    if (
      repositoryCheck.exitCode !== 0 ||
      repositoryCheck.stdout.trim() !== "true"
    ) {
      return yield* new GitNotRepositoryError();
    }

    const repositoryRoot = (
      yield* requireSuccess(runner, "resolve repository root", [
        "rev-parse",
        "--show-toplevel",
      ])
    ).replace(/\r?\n$/, "");

    const stagedPaths = nulSeparatedChangedPaths(
      yield* requireSuccess(runner, "list staged files", [
        "diff",
        "--cached",
        "--find-renames",
        "--name-status",
        "-z",
        "--diff-filter=ACDMRTUXB",
        "--",
      ], repositoryRoot),
    );

    if (scope === "staged") {
      const staged = yield* collectPatches(
        runner,
        inspector,
        stagedPaths,
        "staged",
        repositoryRoot,
      );

      return { files: staged };
    }

    const unstagedPaths = nulSeparatedChangedPaths(
      yield* requireSuccess(runner, "list unstaged files", [
        "diff",
        "--find-renames",
        "--name-status",
        "-z",
        "--diff-filter=ACDMRTUXB",
        "--",
      ], repositoryRoot),
    );
    const untrackedPaths = nulSeparatedPaths(
      yield* requireSuccess(runner, "list untracked files", [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
      ], repositoryRoot),
    );
    const baseResult = yield* execute(
      runner,
      "resolve review base",
      ["rev-parse", "--verify", "HEAD"],
      1_024,
      repositoryRoot,
    );
    const base = baseResult.exitCode === 0 ? "HEAD" : emptyTree;
    const trackedPaths = mergeChangedPaths([
      ...stagedPaths,
      ...unstagedPaths,
    ]);
    const untrackedChanges = untrackedPaths.map((path) => ({
      path,
      pathspecs: [path],
    }));
    const [tracked, untracked] = yield* Effect.all(
      [
        collectPatches(
          runner,
          inspector,
          trackedPaths,
          "working-tree",
          repositoryRoot,
          base,
        ),
        collectPatches(
          runner,
          inspector,
          untrackedChanges,
          "untracked",
          repositoryRoot,
        ),
      ],
      { concurrency: "unbounded" },
    );

    return { files: [...tracked, ...untracked] };
  });

export const layer: Layer.Layer<
  GitService,
  never,
  CommandRunner.CommandRunner | FileInspector.FileInspector
> = Layer.effect(
  GitService,
  Effect.gen(function* () {
    const runner = yield* CommandRunner.CommandRunner;
    const inspector = yield* FileInspector.FileInspector;

    return {
      readDiff: (scope) => readDiff(runner, inspector, scope),
    };
  }),
);
