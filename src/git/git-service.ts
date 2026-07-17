import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ReviewScope } from "../domain/scope";
import * as CommandRunner from "../platform/command-runner";
import * as FileInspector from "../platform/file-inspector";
import {
  findUnmergedPaths,
  mergePatchTargetsByPath,
  parseNulSeparatedChanges,
  parseNulSeparatedPaths,
  type GitChange,
} from "./git-change-parser";
import {
  executeGit,
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
  GitUnmergedPathsError,
  GitWorkingTreeUnavailableError,
  makeGitCommandError,
  type GitError,
} from "./git-errors";

export type {
  GitDiff,
  GitFilePatch,
  GitSkippedFile,
} from "./git-diff";
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
  type GitProcessPhase,
  GitUnmergedPathsError,
  GitWorkingTreeUnavailableError,
} from "./git-errors";

export class GitService extends Context.Service<
  GitService,
  {
    /**
     * Collects reviewable text patches for the selected scope and reports
     * binary or oversized files separately.
     */
    readonly readDiff: (
      scope: ReviewScope,
    ) => Effect.Effect<GitDiff, GitError>;
  }
>()("reviewstuff/GitService") {}

const diffSourceCollectionConcurrency = 2;
const trackedChangeListingArguments = [
  "--find-renames",
  "--name-status",
  "-z",
  "--diff-filter=ACDMRTUXB",
  "--",
] as const;

const ensureReviewableWorkingTree = Effect.fn(
  "GitService.ensureReviewableWorkingTree",
)(function* (runner: CommandRunner.Service) {
  const operation = "detect git repository";

  // The raw result distinguishes an absent repository from other failures and
  // from repositories, such as bare repositories, that have no working tree.
  const workingTreeDetection = yield* executeGit(
    runner,
    operation,
    ["rev-parse", "--is-inside-work-tree"],
    gitMetadataMaxOutputBytes,
  );

  if (workingTreeDetection.exitCode !== 0) {
    if (
      !workingTreeDetection.stderr.toLowerCase().includes(
        "not a git repository",
      )
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
): Effect.Effect<string, GitError> =>
  requireGitSuccess(runner, "resolve repository root", [
    "rev-parse",
    "--show-toplevel",
  ]).pipe(
    Effect.map((output) => output.replace(/\r?\n$/, "")),
  );

type TrackedChangeMode = "staged" | "unstaged";

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
    repositoryRoot,
  ).pipe(
    Effect.flatMap((output) =>
      parseNulSeparatedChanges(output, operation)
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
    repositoryRoot,
  ).pipe(
    Effect.flatMap((output) =>
      parseNulSeparatedPaths(output, operation)
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
      gitObjectMetadataMaxOutputBytes,
      repositoryRoot,
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
    inspector: FileInspector.Service,
    repositoryRoot: string,
    stagedChanges: ReadonlyArray<GitChange>,
  ): Effect.Effect<GitDiff, GitError> =>
    ensureNoUnmergedChanges(stagedChanges).pipe(
      Effect.andThen(
        collectDiffPatches({
          runner,
          inspector,
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
  inspector: FileInspector.Service,
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

  // A file may appear in both staged and unstaged changes. Merge its
  // pathspecs so the working-tree diff reads every tracked file only once.
  const trackedPatchTargets = mergePatchTargetsByPath(trackedChanges);
  const untrackedPatchTargets = untrackedFiles.map((path) => ({
    path,
    pathspecs: [path],
  }));
  const [trackedDiff, untrackedDiff] = yield* Effect.all(
    [
      collectDiffPatches({
        runner,
        inspector,
        targets: trackedPatchTargets,
        source: "working-tree",
        repositoryRoot,
        diffBase: reviewBase,
      }),
      collectDiffPatches({
        runner,
        inspector,
        targets: untrackedPatchTargets,
        source: "untracked",
        repositoryRoot,
      }),
    ],
    { concurrency: diffSourceCollectionConcurrency },
  );

  return {
    files: [...trackedDiff.files, ...untrackedDiff.files],
    skippedFiles: [
      ...trackedDiff.skippedFiles,
      ...untrackedDiff.skippedFiles,
    ],
  };
});

const readDiff = Effect.fn("GitService.readDiff")(function* (
  runner: CommandRunner.Service,
  inspector: FileInspector.Service,
  scope: ReviewScope,
): Effect.fn.Return<GitDiff, GitError> {
  yield* ensureReviewableWorkingTree(runner);
  const repositoryRoot = yield* resolveRepositoryRoot(runner);
  const stagedChanges = yield* listTrackedChanges(
    runner,
    repositoryRoot,
    "staged",
  );

  if (scope === "staged") {
    return yield* collectStagedDiff(
      runner,
      inspector,
      repositoryRoot,
      stagedChanges,
    );
  }

  return yield* collectWorkingTreeDiff(
    runner,
    inspector,
    repositoryRoot,
    stagedChanges,
  );
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
