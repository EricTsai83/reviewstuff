import * as Effect from "effect/Effect";
import type {
  ReviewFileSource,
  ReviewSkippedFile,
} from "../domain/review-file";
import * as CommandRunner from "../platform/command-runner";
import * as FileInspector from "../platform/file-inspector";
import type { GitPatchTarget } from "./git-change-parser";
import { executeGit, readGitObjectSize } from "./git-command";
import {
  GitChangedFileUnavailableError,
  GitExecutionError,
  makeGitCommandError,
  type GitError,
} from "./git-errors";

const patchMaxOutputBytes = 512 * 1024;
const reviewableFileMaxBytes = BigInt(patchMaxOutputBytes);
const patchCollectionConcurrency = 4;

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

const isBinaryPatch = (patch: string): boolean =>
  patch.split("\n").some((line) =>
    line.startsWith("Binary files ") || line === "GIT binary patch"
  );

const readChangedFileSize = (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  path: string,
  source: GitFilePatch["source"],
  repositoryRoot: string,
): Effect.Effect<bigint | undefined, GitError> => {
  if (source === "staged") {
    return readGitObjectSize(runner, `:./${path}`, repositoryRoot).pipe(
      Effect.flatMap((indexSize) =>
        indexSize === undefined
          ? readGitObjectSize(runner, `HEAD:${path}`, repositoryRoot)
          : Effect.succeed(indexSize),
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
    Effect.flatMap((workingTreeSize) => {
      if (workingTreeSize !== undefined) {
        return Effect.succeed(workingTreeSize);
      }

      if (source === "untracked") {
        return Effect.succeed(undefined);
      }

      return readGitObjectSize(runner, `HEAD:${path}`, repositoryRoot).pipe(
        Effect.flatMap((headSize) =>
          headSize === undefined
            ? readGitObjectSize(runner, `:./${path}`, repositoryRoot)
            : Effect.succeed(headSize),
        ),
      );
    }),
  );
};

const readDiffPatch = (
  runner: CommandRunner.Service,
  operation: string,
  patchArguments: ReadonlyArray<string>,
  patchPath: string,
  patchSource: GitFilePatch["source"],
  expectedExitCodes: ReadonlySet<number>,
  repositoryRoot: string,
): Effect.Effect<GitFilePatch | GitSkippedFile, GitError> =>
  executeGit(
    runner,
    operation,
    patchArguments,
    patchMaxOutputBytes,
    repositoryRoot,
  ).pipe(
    Effect.flatMap(
      (patchResult): Effect.Effect<GitFilePatch | GitSkippedFile, GitError> => {
        if (!expectedExitCodes.has(patchResult.exitCode)) {
          return Effect.fail(makeGitCommandError(operation, patchResult));
        }

        if (patchResult.stdout.length === 0) {
          return Effect.fail(
            new GitChangedFileUnavailableError({
              path: patchPath,
              source: patchSource,
            }),
          );
        }

        return Effect.succeed(
          isBinaryPatch(patchResult.stdout)
            ? { path: patchPath, source: patchSource, reason: "binary" }
            : {
                path: patchPath,
                patch: patchResult.stdout,
                source: patchSource,
              },
        );
      },
    ),
  );

export interface GitPatchCollection {
  readonly files: ReadonlyArray<GitFilePatch>;
  readonly skippedFiles: ReadonlyArray<GitSkippedFile>;
}

export const collectDiffPatches = (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  patchTargets: ReadonlyArray<GitPatchTarget>,
  source: GitFilePatch["source"],
  repositoryRoot: string,
  diffBase: string = "HEAD",
): Effect.Effect<GitPatchCollection, GitError> =>
  Effect.forEach(patchTargets, ({ path, pathspecs }) =>
    readChangedFileSize(runner, inspector, path, source, repositoryRoot).pipe(
      Effect.flatMap((size) => {
        if (size === undefined && source === "untracked") {
          return Effect.fail(
            new GitChangedFileUnavailableError({ path, source }),
          );
        }

        if (size !== undefined && size > reviewableFileMaxBytes) {
          return Effect.succeed<GitSkippedFile>({
            path,
            source,
            reason: "file-too-large",
            sizeBytes: size.toString(),
            limitBytes: patchMaxOutputBytes,
          });
        }

        if (source === "untracked") {
          return readDiffPatch(
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
            source,
            new Set([0, 1]),
            repositoryRoot,
          );
        }

        const diffBaseArguments = source === "staged"
          ? ["--cached"]
          : [diffBase];

        return readDiffPatch(
          runner,
          `read ${source} diff`,
          [
            "diff",
            ...diffBaseArguments,
            "--find-renames",
            "--no-color",
            "--no-ext-diff",
            "--unified=3",
            "--",
            ...pathspecs,
          ],
          path,
          source,
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
