import * as Effect from "effect/Effect";
import type { ReviewFileSource } from "../domain/review-file";
import * as CommandRunner from "../platform/command-runner";
import type {
  GitChangeStatus,
  GitPatchTarget,
} from "./git-change-parser";
import {
  executeGit,
  gitDiffTimeoutMilliseconds,
  gitObjectMetadataMaxOutputBytes,
  parseGitObjectId,
  resolveEmptyBlobObjectId,
} from "./git-command";
import {
  GitChangedFileUnavailableError,
  GitInvalidOutputError,
  makeGitCommandError,
  type GitError,
} from "./git-errors";
import {
  type GitDiffHunk,
  type ParsedDiffRecord,
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
  /**
   * Present only for untracked files, whose empty diff is ambiguous: the file
   * may be empty or may have changed since it was listed. The shared effect
   * resolves the empty blob once for the whole collection.
   */
  readonly emptyBlobObjectId?: Effect.Effect<string, GitError>;
}

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

/**
 * Picks the records that describe the requested file.
 *
 * A pathspec-limited diff can return more than one record: a typechange
 * expands into a delete plus a create for the same path, and a copy or rename
 * whose source was modified as well returns the source record alongside the
 * target record. Selecting by reported path keeps one change per path.
 */
const selectTargetRecords = (
  records: ReadonlyArray<ParsedDiffRecord>,
  target: GitPatchTarget,
): ReadonlyArray<ParsedDiffRecord> | undefined => {
  const selected = records.filter((record) => record.path === target.path);
  if (selected.length > 0) {
    return selected;
  }

  // A record shape this parser cannot attribute, such as a binary rename, is
  // accepted only when it is the whole output. A record that reports another
  // path is never attributed to this target.
  const [onlyRecord] = records;
  return records.length === 1 && onlyRecord?.path === undefined
    ? records
    : undefined;
};

/**
 * Merges the selected records into the single change reported for the path.
 *
 * The request budget selects hunks individually, so every hunk of a record
 * after the first repeats that record's own header instead of relying on one
 * carrier hunk. A header-only record has no hunk of its own and is carried on
 * the neighbouring hunk. Any subset therefore reconstructs a valid diff from
 * `fileHeader` plus the selected hunk patches.
 */
const mergeTargetRecords = (
  records: ReadonlyArray<ParsedDiffRecord>,
  target: GitPatchTarget,
  source: ReviewFileSource,
): GitFile => {
  const metadata = fileMetadata(target, source);
  if (records.some((record) => record.binary)) {
    return { ...metadata, kind: "binary" };
  }

  const hunks: Array<GitDiffHunk> = [];
  let pendingHeader = "";

  for (const [index, record] of records.entries()) {
    if (record.hunks.length === 0) {
      if (index > 0) {
        pendingHeader += record.fileHeader;
      }
      continue;
    }

    const ownHeader = index === 0 ? "" : record.fileHeader;
    for (const hunk of record.hunks) {
      const prefix = `${pendingHeader}${ownHeader}`;
      hunks.push(
        prefix === "" ? hunk : { ...hunk, patch: `${prefix}${hunk.patch}` },
      );
      pendingHeader = "";
    }
  }

  const lastHunk = hunks.at(-1);
  if (pendingHeader !== "" && lastHunk !== undefined) {
    hunks[hunks.length - 1] = {
      ...lastHunk,
      patch: `${lastHunk.patch}${pendingHeader}`,
    };
    pendingHeader = "";
  }

  return {
    ...metadata,
    kind: "text",
    patch: records.map((record) => record.patch).join(""),
    fileHeader: `${records[0]?.fileHeader ?? ""}${pendingHeader}`,
    hunks,
  };
};

/**
 * `git diff --no-index` prints nothing for an empty untracked file, which is
 * also what it prints when the file disappeared or gained content after it was
 * listed. Hashing the file distinguishes the two.
 */
const verifyEmptyUntrackedFile = Effect.fn("GitDiff.verifyEmptyUntrackedFile")(
  function* (
    runner: CommandRunner.Service,
    target: GitPatchTarget,
    repositoryRoot: string,
    emptyBlobObjectId: Effect.Effect<string, GitError>,
  ): Effect.fn.Return<GitFile, GitError> {
    const operation = "verify empty untracked file";
    const verification = yield* executeGit(
      runner,
      operation,
      ["hash-object", "--no-filters", "--", target.path],
      {
        maxOutputBytes: gitObjectMetadataMaxOutputBytes,
        workingDirectory: repositoryRoot,
      },
    );
    if (verification.exitCode !== 0) {
      return yield* new GitChangedFileUnavailableError({
        path: target.path,
        source: "untracked",
      });
    }

    const objectId = parseGitObjectId(verification.stdout);
    if (objectId === undefined) {
      return yield* new GitInvalidOutputError({
        operation,
        outputBytes: Buffer.byteLength(verification.stdout),
      });
    }
    if (objectId !== (yield* emptyBlobObjectId)) {
      return yield* new GitChangedFileUnavailableError({
        path: target.path,
        source: "untracked",
      });
    }

    return {
      ...fileMetadata(target, "untracked"),
      kind: "text",
      patch: "",
      fileHeader: "",
      hunks: [],
    };
  },
);

const readDiffPatch = Effect.fn("GitDiff.readDiffPatch")(function* ({
  runner,
  operation,
  args,
  target,
  source,
  expectedExitCodes,
  repositoryRoot,
  emptyBlobObjectId,
}: ReadDiffPatchOptions): Effect.fn.Return<GitFile, GitError> {
  const patchResult = yield* executeGit(runner, operation, args, {
    maxOutputBytes: gitPatchMaxOutputBytes,
    workingDirectory: repositoryRoot,
    timeoutMilliseconds: gitDiffTimeoutMilliseconds,
  });
  if (!expectedExitCodes.has(patchResult.exitCode)) {
    return yield* makeGitCommandError(operation, patchResult);
  }

  if (patchResult.stdout.length === 0) {
    if (source === "untracked" && emptyBlobObjectId !== undefined) {
      return yield* verifyEmptyUntrackedFile(
        runner,
        target,
        repositoryRoot,
        emptyBlobObjectId,
      );
    }

    return yield* new GitChangedFileUnavailableError({
      path: target.path,
      source,
    });
  }

  const records = yield* parseUnifiedDiff(patchResult.stdout, operation);
  const selected = selectTargetRecords(records, target);
  if (selected === undefined) {
    return yield* new GitInvalidOutputError({
      operation,
      outputBytes: Buffer.byteLength(patchResult.stdout),
    });
  }

  return mergeTargetRecords(selected, target, source);
});

const patchCollectionConcurrency = 4;
const gitDiffExitCodes: ReadonlySet<number> = new Set([0]);
const gitNoIndexDiffExitCodes: ReadonlySet<number> = new Set([0, 1]);
/**
 * Reads the file's real content instead of a `textconv` representation.
 *
 * `.gitattributes` selects a diff driver per path and the user's config defines
 * its `textconv` command, so a converted patch can be empty even when the file
 * changed, or can replace the content the reported line numbers refer to.
 * `--no-ext-diff` does not cover this, and the driver name is chosen by the
 * repository, so it cannot be pinned with `-c` either.
 */
const gitPatchContentArguments = ["--no-ext-diff", "--no-textconv"] as const;

export const collectDiffPatches = Effect.fn("GitDiff.collectDiffPatches")(
  function* ({
    runner,
    targets,
    source,
    repositoryRoot,
    diffBase = "HEAD",
  }: CollectDiffPatchesOptions): Effect.fn.Return<GitDiff, GitError> {
    // Resolved lazily and at most once, so a collection without an empty
    // untracked file never spawns the extra process.
    const emptyBlobObjectId = yield* Effect.cached(
      resolveEmptyBlobObjectId(runner, repositoryRoot),
    );
    const files = yield* Effect.forEach(targets, (target) => {
      if (source === "untracked") {
        return readDiffPatch({
          runner,
          operation: "read untracked diff",
          args: [
            "diff",
            "--no-index",
            "--no-color",
            ...gitPatchContentArguments,
            "--unified=3",
            "--",
            "/dev/null",
            target.path,
          ],
          target,
          source,
          expectedExitCodes: gitNoIndexDiffExitCodes,
          repositoryRoot,
          emptyBlobObjectId,
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
          ...gitPatchContentArguments,
          "--unified=3",
          "--",
          ...target.pathspecs,
        ],
        target,
        source,
        expectedExitCodes: gitDiffExitCodes,
        repositoryRoot,
      });
    }, { concurrency: patchCollectionConcurrency });

    return { files };
  },
);
