import * as Effect from "effect/Effect";
import type { ReviewFileSource } from "../domain/review-file";
import * as CommandRunner from "../platform/command-runner";
import type {
  GitChangeStatus,
  GitPatchTarget,
} from "./git-change-parser";
import {
  executeGit,
  gitObjectMetadataMaxOutputBytes,
} from "./git-command";
import {
  GitChangedFileUnavailableError,
  GitInvalidOutputError,
  makeGitCommandError,
  type GitError,
} from "./git-errors";
import {
  type GitDiffHunk,
  parseUnifiedDiff,
} from "./unified-diff-parser";

export const gitPatchMaxOutputBytes = 4 * 1024 * 1024;

interface GitFileMetadata {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly status: GitChangeStatus;
  readonly score?: number;
  readonly previousPath?: string;
}

export interface GitTextFile extends GitFileMetadata {
  readonly kind: "text";
  readonly patch: string;
  readonly fileHeader: string;
  readonly hunks: ReadonlyArray<GitDiffHunk>;
}

export interface GitBinaryFile extends GitFileMetadata {
  readonly kind: "binary";
}

export type GitFile = GitTextFile | GitBinaryFile;

export interface GitDiff {
  readonly files: ReadonlyArray<GitFile>;
}

export interface CollectDiffPatchesOptions {
  readonly runner: CommandRunner.Service;
  readonly targets: ReadonlyArray<GitPatchTarget>;
  readonly source: ReviewFileSource;
  readonly repositoryRoot: string;
  readonly diffBase?: string;
}

interface ReadDiffPatchOptions {
  readonly runner: CommandRunner.Service;
  readonly operation: string;
  readonly args: ReadonlyArray<string>;
  readonly target: GitPatchTarget;
  readonly source: ReviewFileSource;
  readonly expectedExitCodes: ReadonlySet<number>;
  readonly repositoryRoot: string;
}

const gitObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})\n$/iu;

const fileMetadata = (
  target: GitPatchTarget,
  source: ReviewFileSource,
): GitFileMetadata => ({
  path: target.path,
  source,
  status: target.status,
  ...(target.score === undefined ? {} : { score: target.score }),
  ...(target.previousPath === undefined
    ? {}
    : { previousPath: target.previousPath }),
});

const readDiffPatch = ({
  runner,
  operation,
  args,
  target,
  source,
  expectedExitCodes,
  repositoryRoot,
}: ReadDiffPatchOptions): Effect.Effect<GitFile, GitError> =>
  executeGit(
    runner,
    operation,
    args,
    gitPatchMaxOutputBytes,
    repositoryRoot,
  ).pipe(
    Effect.flatMap((patchResult): Effect.Effect<GitFile, GitError> => {
      if (!expectedExitCodes.has(patchResult.exitCode)) {
        return Effect.fail(makeGitCommandError(operation, patchResult));
      }

      if (patchResult.stdout.length === 0) {
        if (source === "untracked") {
          return executeGit(
            runner,
            "verify empty untracked file",
            ["hash-object", "--no-filters", "--", target.path],
            gitObjectMetadataMaxOutputBytes,
            repositoryRoot,
          ).pipe(
            Effect.flatMap((verification): Effect.Effect<GitFile, GitError> => {
              if (verification.exitCode !== 0) {
                return Effect.fail(
                  new GitChangedFileUnavailableError({
                    path: target.path,
                    source,
                  }),
                );
              }
              if (!gitObjectIdPattern.test(verification.stdout)) {
                return Effect.fail(
                  new GitInvalidOutputError({
                    operation: "verify empty untracked file",
                    outputBytes: Buffer.byteLength(verification.stdout),
                  }),
                );
              }

              return executeGit(
                runner,
                "resolve empty blob",
                ["hash-object", "--no-filters", "--", "/dev/null"],
                gitObjectMetadataMaxOutputBytes,
                repositoryRoot,
              ).pipe(
                Effect.flatMap((emptyBlob): Effect.Effect<GitFile, GitError> => {
                  if (emptyBlob.exitCode !== 0) {
                    return Effect.fail(
                      makeGitCommandError("resolve empty blob", emptyBlob),
                    );
                  }
                  if (!gitObjectIdPattern.test(emptyBlob.stdout)) {
                    return Effect.fail(
                      new GitInvalidOutputError({
                        operation: "resolve empty blob",
                        outputBytes: Buffer.byteLength(emptyBlob.stdout),
                      }),
                    );
                  }
                  if (verification.stdout !== emptyBlob.stdout) {
                    return Effect.fail(
                      new GitChangedFileUnavailableError({
                        path: target.path,
                        source,
                      }),
                    );
                  }

                  return Effect.succeed({
                    ...fileMetadata(target, source),
                    kind: "text",
                    patch: "",
                    fileHeader: "",
                    hunks: [],
                  });
                }),
              );
            }),
          );
        }

        return Effect.fail(
          new GitChangedFileUnavailableError({
            path: target.path,
            source,
          }),
        );
      }

      return parseUnifiedDiff(patchResult.stdout, operation).pipe(
        Effect.map((parsed): GitFile =>
          parsed.binary
            ? {
                ...fileMetadata(target, source),
                kind: "binary",
              }
            : {
                ...fileMetadata(target, source),
                kind: "text",
                patch: patchResult.stdout,
                fileHeader: parsed.fileHeader,
                hunks: parsed.hunks,
              }
        ),
      );
    }),
  );

const patchCollectionConcurrency = 4;
const gitDiffExitCodes: ReadonlySet<number> = new Set([0]);
const gitNoIndexDiffExitCodes: ReadonlySet<number> = new Set([0, 1]);

export const collectDiffPatches = ({
  runner,
  targets,
  source,
  repositoryRoot,
  diffBase = "HEAD",
}: CollectDiffPatchesOptions): Effect.Effect<GitDiff, GitError> =>
  Effect.forEach(targets, (target) => {
    if (source === "untracked") {
      return readDiffPatch({
        runner,
        operation: "read untracked diff",
        args: [
          "diff",
          "--no-index",
          "--no-color",
          "--no-ext-diff",
          "--unified=3",
          "--",
          "/dev/null",
          target.path,
        ],
        target,
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
        "--find-copies-harder",
        "--no-color",
        "--no-ext-diff",
        "--unified=3",
        "--",
        ...target.pathspecs,
      ],
      target,
      source,
      expectedExitCodes: gitDiffExitCodes,
      repositoryRoot,
    });
  }, { concurrency: patchCollectionConcurrency }).pipe(
    Effect.map((files) => ({ files })),
  );
