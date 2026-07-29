import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { RepositoryContext } from "../domain/repository";
import type { ReviewScope } from "../domain/scope";
import * as CommandRunner from "../platform/command-runner";
import {
  findUnmergedPaths,
  parseNulSeparatedChanges,
  parseNulSeparatedPaths,
  type GitChange,
} from "./git-change-parser";
import {
  executeGit,
  gitDiffTimeoutMilliseconds,
  gitMetadataMaxOutputBytes,
  gitObjectMetadataMaxOutputBytes,
  requireGitSuccess,
  resolveEmptyTreeObjectId,
} from "./git-command";
import {
  collectDiffPatches,
  type GitDiff,
} from "./git-diff";
import {
  GitInvalidOutputError,
  GitNotRepositoryError,
  GitRepositoryPathNotFoundError,
  GitUnmergedPathsError,
  GitWorkingTreeUnavailableError,
  makeGitCommandError,
  type GitError,
} from "./git-errors";

export type {
  GitBinaryFile,
  GitDiff,
  GitFile,
  GitTextFile,
} from "./git-diff";
export type { GitDiffHunk } from "./unified-diff-parser";
export {
  GitChangedFileUnavailableError,
  GitCommandError,
  type GitCommandFailure,
  GitCommandOutputLimitError,
  GitCommandProcessError,
  GitCommandTimeoutError,
  type GitError,
  GitExecutionError,
  GitInvalidOutputError,
  GitNotRepositoryError,
  GitRepositoryPathNotFoundError,
  type GitProcessPhase,
  GitUnmergedPathsError,
  GitWorkingTreeUnavailableError,
} from "./git-errors";

export class GitService extends Context.Service<
  GitService,
  {
    /**
     * Validates a candidate path and returns the canonical working-tree root.
     */
    readonly resolveRepository: (
      candidatePath?: string,
    ) => Effect.Effect<RepositoryContext, GitError>;
    /**
     * Collects normalized metadata for every selected file and complete text
     * hunks when the file is not binary.
     */
    readonly readDiff: (
      repository: RepositoryContext,
      scope: ReviewScope,
    ) => Effect.Effect<GitDiff, GitError>;
  }
>()("reviewstuff/GitService") {}

const diffSourceCollectionConcurrency = 2;
const trackedChangeListingArguments = [
  "--find-copies-harder",
  "--name-status",
  "-z",
  "--diff-filter=ACDMRTUX",
  "--",
] as const;

const inRepository = (
  candidatePath: string | undefined,
  args: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  candidatePath === undefined ? args : ["-C", candidatePath, ...args];

const ensureReviewableWorkingTree = Effect.fn(
  "GitService.ensureReviewableWorkingTree",
)(function* (
  runner: CommandRunner.Service,
  candidatePath: string | undefined,
) {
  const operation = "detect git repository";

  // The raw result distinguishes an absent repository from other failures and
  // from repositories, such as bare repositories, that have no working tree.
  const workingTreeDetection = yield* executeGit(
    runner,
    operation,
    inRepository(candidatePath, ["rev-parse", "--is-inside-work-tree"]),
    { maxOutputBytes: gitMetadataMaxOutputBytes },
  );

  if (workingTreeDetection.exitCode !== 0) {
    const normalizedStderr = workingTreeDetection.stderr.toLowerCase();
    if (
      candidatePath !== undefined &&
      normalizedStderr.includes("cannot change to") &&
      normalizedStderr.includes("no such file or directory")
    ) {
      return yield* new GitRepositoryPathNotFoundError({
        path: candidatePath,
      });
    }

    if (
      !normalizedStderr.includes("not a git repository")
    ) {
      return yield* makeGitCommandError(operation, workingTreeDetection);
    }

    return yield* new GitNotRepositoryError({
      exitCode: workingTreeDetection.exitCode,
      stdoutLength: workingTreeDetection.stdout.length,
      stderrLength: workingTreeDetection.stderr.length,
    });
  }

  const workingTreeStatus = workingTreeDetection.stdout.trim();
  if (workingTreeStatus === "false") {
    return yield* new GitWorkingTreeUnavailableError({
      stdoutLength: workingTreeDetection.stdout.length,
      stderrLength: workingTreeDetection.stderr.length,
    });
  }
  if (workingTreeStatus !== "true") {
    return yield* new GitInvalidOutputError({
      operation,
      outputBytes: Buffer.byteLength(workingTreeDetection.stdout),
    });
  }
});

const resolveRepositoryRoot = (
  runner: CommandRunner.Service,
  candidatePath: string | undefined,
): Effect.Effect<string, GitError> =>
  requireGitSuccess(
    runner,
    "resolve repository root",
    inRepository(candidatePath, ["rev-parse", "--show-toplevel"]),
  ).pipe(
    Effect.flatMap((output) => {
      // Only the terminating newline is removed: a repository path may itself
      // legitimately end with a carriage return.
      const root = output.replace(/\n$/, "");

      return root.startsWith("/")
        ? Effect.succeed(root)
        : Effect.fail(
          new GitInvalidOutputError({
            operation: "resolve repository root",
            outputBytes: Buffer.byteLength(output),
          }),
        );
    }),
  );

const resolveRepository = Effect.fn("GitService.resolveRepository")(
  function* (
    runner: CommandRunner.Service,
    candidatePath: string | undefined,
  ): Effect.fn.Return<RepositoryContext, GitError> {
    yield* ensureReviewableWorkingTree(runner, candidatePath);
    const root = yield* resolveRepositoryRoot(runner, candidatePath);

    return { root };
  },
);

type TrackedChangeMode = "staged" | "unstaged";

/**
 * Invariant: one path contributes at most one change to a single scope
 * collection, so it is collected, reported and counted exactly once.
 *
 * An unmerged listing can repeat a path, for example as `U` and `M` in the
 * same unstaged listing, so `U` wins to keep conflict detection reliable.
 * Otherwise the first change listed for a path wins.
 */
const dedupeChangesByPath = (
  changes: ReadonlyArray<GitChange>,
): ReadonlyArray<GitChange> => {
  const keptByPath = new Map<string, GitChange>();

  for (const change of changes) {
    const kept = keptByPath.get(change.path);
    if (kept === undefined || (kept.status !== "U" && change.status === "U")) {
      keptByPath.set(change.path, change);
    }
  }

  return [...keptByPath.values()];
};

const listTrackedChanges = (
  runner: CommandRunner.Service,
  repositoryRoot: string,
  mode: TrackedChangeMode,
): Effect.Effect<ReadonlyArray<GitChange>, GitError> => {
  const operation = mode === "staged"
    ? "list staged files"
    : "list unstaged files";
  const modeArguments = mode === "staged" ? ["--cached"] : [];

  return requireGitSuccess(
    runner,
    operation,
    [
      "diff",
      ...modeArguments,
      ...trackedChangeListingArguments,
    ],
    {
      workingDirectory: repositoryRoot,
      timeoutMilliseconds: gitDiffTimeoutMilliseconds,
    },
  ).pipe(
    Effect.flatMap((output) =>
      parseNulSeparatedChanges(output, operation).pipe(
        Effect.map(dedupeChangesByPath),
      )
    ),
  );
};

const listWorkingTreeChanges = (
  runner: CommandRunner.Service,
  repositoryRoot: string,
  reviewBase: string,
): Effect.Effect<ReadonlyArray<GitChange>, GitError> => {
  const operation = "list working-tree files";

  return requireGitSuccess(
    runner,
    operation,
    [
      "diff",
      reviewBase,
      ...trackedChangeListingArguments,
    ],
    {
      workingDirectory: repositoryRoot,
      timeoutMilliseconds: gitDiffTimeoutMilliseconds,
    },
  ).pipe(
    Effect.flatMap((output) =>
      parseNulSeparatedChanges(output, operation).pipe(
        Effect.map(dedupeChangesByPath),
      )
    ),
  );
};

const listUntrackedFiles = (
  runner: CommandRunner.Service,
  repositoryRoot: string,
): Effect.Effect<ReadonlyArray<string>, GitError> => {
  const operation = "list untracked files";

  return requireGitSuccess(
    runner,
    operation,
    ["ls-files", "--others", "--exclude-standard", "-z", "--"],
    {
      workingDirectory: repositoryRoot,
      // Listing untracked files walks the whole working tree, so it needs the
      // same larger budget as the whole-tree diff scans.
      timeoutMilliseconds: gitDiffTimeoutMilliseconds,
    },
  ).pipe(
    Effect.flatMap((output) =>
      parseNulSeparatedPaths(output, operation).pipe(
        // Git reports an untracked directory it cannot look inside, such as an
        // embedded repository, as a single trailing-slash entry. It is not a
        // file, so neither `diff --no-index` nor `hash-object` can read it.
        Effect.map((paths) => paths.filter((path) => !path.endsWith("/"))),
      )
    ),
  );
};

const ensureNoUnmergedChanges = (
  changes: ReadonlyArray<GitChange>,
): Effect.Effect<void, GitUnmergedPathsError> => {
  const conflictingPaths = findUnmergedPaths(changes);

  return conflictingPaths.length === 0
    ? Effect.void
    : Effect.fail(new GitUnmergedPathsError({ paths: conflictingPaths }));
};

const resolveReviewBase = Effect.fn("GitService.resolveReviewBase")(
  function* (
    runner: CommandRunner.Service,
    repositoryRoot: string,
  ): Effect.fn.Return<string, GitError> {
    const operation = "resolve review base";
    const headCommitVerification = yield* executeGit(
      runner,
      operation,
      ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
      {
        maxOutputBytes: gitObjectMetadataMaxOutputBytes,
        workingDirectory: repositoryRoot,
      },
    );

    if (headCommitVerification.exitCode === 0) {
      return "HEAD";
    }
    if (headCommitVerification.exitCode !== 1) {
      return yield* makeGitCommandError(operation, headCommitVerification);
    }

    // An initial repository has no HEAD commit, so its tracked files are
    // compared against the repository-format-specific empty tree.
    return yield* resolveEmptyTreeObjectId(runner, repositoryRoot);
  },
);

const collectStagedDiff = Effect.fn("GitService.collectStagedDiff")(
  (
    runner: CommandRunner.Service,
    repositoryRoot: string,
    stagedChanges: ReadonlyArray<GitChange>,
  ): Effect.Effect<GitDiff, GitError> =>
    ensureNoUnmergedChanges(stagedChanges).pipe(
      Effect.andThen(
        collectDiffPatches({
          runner,
          targets: stagedChanges,
          source: "staged",
          repositoryRoot,
        }),
      ),
    ),
);

const collectWorkingTreeDiff = Effect.fn(
  "GitService.collectWorkingTreeDiff",
)(function* (
  runner: CommandRunner.Service,
  repositoryRoot: string,
  stagedChanges: ReadonlyArray<GitChange>,
): Effect.fn.Return<GitDiff, GitError> {
  const unstagedChanges = yield* listTrackedChanges(
    runner,
    repositoryRoot,
    "unstaged",
  );
  const trackedChanges = [...stagedChanges, ...unstagedChanges];
  yield* ensureNoUnmergedChanges(trackedChanges);

  const untrackedFiles = yield* listUntrackedFiles(runner, repositoryRoot);
  const reviewBase = yield* resolveReviewBase(runner, repositoryRoot);
  const workingTreeChanges = yield* listWorkingTreeChanges(
    runner,
    repositoryRoot,
    reviewBase,
  );
  // `git rm --cached <path>` leaves the path both tracked as a deletion and
  // present on disk as untracked, so the tracked change is kept and the
  // untracked duplicate is dropped.
  const trackedPaths = new Set(
    workingTreeChanges.map((change) => change.path),
  );
  const untrackedPatchTargets = untrackedFiles
    .filter((path) => !trackedPaths.has(path))
    .map((path) => ({
      path,
      pathspecs: [path],
      status: "A" as const,
    }));
  const [trackedDiff, untrackedDiff] = yield* Effect.all(
    [
      collectDiffPatches({
        runner,
        targets: workingTreeChanges,
        source: "working-tree",
        repositoryRoot,
        diffBase: reviewBase,
      }),
      collectDiffPatches({
        runner,
        targets: untrackedPatchTargets,
        source: "untracked",
        repositoryRoot,
      }),
    ],
    { concurrency: diffSourceCollectionConcurrency },
  );

  return {
    files: [...trackedDiff.files, ...untrackedDiff.files],
  };
});

const readDiff = Effect.fn("GitService.readDiff")(function* (
  runner: CommandRunner.Service,
  repository: RepositoryContext,
  scope: ReviewScope,
): Effect.fn.Return<GitDiff, GitError> {
  const repositoryRoot = repository.root;
  const stagedChanges = yield* listTrackedChanges(
    runner,
    repositoryRoot,
    "staged",
  );

  if (scope === "staged") {
    return yield* collectStagedDiff(
      runner,
      repositoryRoot,
      stagedChanges,
    );
  }

  return yield* collectWorkingTreeDiff(
    runner,
    repositoryRoot,
    stagedChanges,
  );
});

export const make = Effect.gen(function* () {
  const runner = yield* CommandRunner.CommandRunner;

  return GitService.of({
    resolveRepository: (candidatePath) =>
      resolveRepository(runner, candidatePath),
    readDiff: (repository, scope) => readDiff(runner, repository, scope),
  });
});

export const layer: Layer.Layer<
  GitService,
  never,
  CommandRunner.CommandRunner
> = Layer.effect(GitService, make);
