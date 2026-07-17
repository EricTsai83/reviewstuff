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
const gitDiffExitCodes: ReadonlySet<number> = new Set([0]);
const gitNoIndexDiffExitCodes: ReadonlySet<number> = new Set([0, 1]);

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

interface ReadChangedFileSizeOptions {
  readonly runner: CommandRunner.Service;
  readonly inspector: FileInspector.Service;
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly repositoryRoot: string;
}

interface ReadDiffPatchOptions {
  readonly runner: CommandRunner.Service;
  readonly operation: string;
  readonly args: ReadonlyArray<string>;
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly expectedExitCodes: ReadonlySet<number>;
  readonly repositoryRoot: string;
}

export interface CollectDiffPatchesOptions {
  readonly runner: CommandRunner.Service;
  readonly inspector: FileInspector.Service;
  readonly targets: ReadonlyArray<GitPatchTarget>;
  readonly source: ReviewFileSource;
  readonly repositoryRoot: string;
  readonly diffBase?: string;
}

const isBinaryPatch = (patch: string): boolean =>
  patch.split("\n").some((line) =>
    line.startsWith("Binary files ") || line === "GIT binary patch"
  );

const readChangedFileSize = ({
  runner,
  inspector,
  path,
  source,
  repositoryRoot,
}: ReadChangedFileSizeOptions): Effect.Effect<bigint | undefined, GitError> => {
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

const readDiffPatch = ({
  runner,
  operation,
  args,
  path,
  source,
  expectedExitCodes,
  repositoryRoot,
}: ReadDiffPatchOptions): Effect.Effect<GitFilePatch | GitSkippedFile, GitError> =>
  executeGit(
    runner,
    operation,
    args,
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
              path,
              source,
            }),
          );
        }

        return Effect.succeed(
          isBinaryPatch(patchResult.stdout)
            ? { path, source, reason: "binary" }
            : {
                path,
                patch: patchResult.stdout,
                source,
              },
        );
      },
    ),
  );

export const collectDiffPatches = ({
  runner,
  inspector,
  targets,
  source,
  repositoryRoot,
  diffBase = "HEAD",
}: CollectDiffPatchesOptions): Effect.Effect<GitDiff, GitError> =>
  Effect.forEach(targets, ({ path, pathspecs }) =>
    readChangedFileSize({
      runner,
      inspector,
      path,
      source,
      repositoryRoot,
    }).pipe(
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
          return readDiffPatch({
            runner,
            operation: "read untracked diff",
            args: [
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
            expectedExitCodes: gitNoIndexDiffExitCodes,
            repositoryRoot,
          });
        }

        const diffBaseArguments = source === "staged"
          ? ["--cached"]
          : [diffBase];

        return readDiffPatch({
          runner,
          operation: `read ${source} diff`,
          args: [
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
          expectedExitCodes: gitDiffExitCodes,
          repositoryRoot,
        });
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
