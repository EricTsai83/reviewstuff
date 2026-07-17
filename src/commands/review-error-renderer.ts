import * as Duration from "effect/Duration";
import * as Match from "effect/Match";
import { escapeTerminalText } from "../output/report-renderer";
import type { RunReviewError } from "../use-cases/run-review";

type GitCommandError = Extract<
  RunReviewError,
  { readonly _tag: "GitCommandError" }
>;

const renderGitCommandFailure = (error: GitCommandError): string => {
  const summary =
    `Git ${error.operation} failed with exit code ${error.exitCode}.`;
  const guidance = (() => {
    switch (error.failure) {
      case "index-locked":
        return "The Git index is locked. Make sure no other Git process is running, then remove a stale .git/index.lock file.";
      case "permission-denied":
        return "Git could not access a repository file because permission was denied.";
      case "repository-corrupt":
        return "Git reported corrupt repository data. Run `git fsck` for details.";
      case "unsafe-repository":
        return "Git refused the repository because its ownership is considered unsafe. Verify the directory owner, then configure `safe.directory` only if you trust it.";
      case "unknown":
        return "Run `git status` in the repository for more details.";
    }
  })();

  return `${summary} ${guidance}`;
};

const renderUnmergedPaths = (paths: ReadonlyArray<string>): string =>
  [
    "Review cannot start because unresolved merge conflicts exist:",
    "",
    ...paths.map((path) => `- ${escapeTerminalText(path)}`),
    "",
    "Resolve and stage these files, or abort the merge/rebase, then run review again.",
  ].join("\n");

const renderGitExecutionFailure = (
  error: Extract<RunReviewError, { readonly _tag: "GitExecutionError" }>,
): string => {
  switch (error.failure) {
    case "command-start":
      return `Unable to start Git while attempting to ${error.operation}.`;
    case "command-termination":
      return `Unable to terminate Git after ${error.operation}.`;
    case "file-inspection":
      return `Unable to ${error.operation} because file inspection failed.`;
  }
};

export const renderReviewError = (error: RunReviewError): string =>
  Match.valueTags(error, {
    ConfigFileReadError: (configError) =>
      `Unable to read config file ${escapeTerminalText(configError.path)}.`,
    ConfigFileInvalidError: (configError) =>
      `Invalid config file ${escapeTerminalText(configError.path)}: ${escapeTerminalText(configError.message)}`,
    UnsupportedReviewSelectionError: (selectionError) =>
      `Unsupported review selection: engine=${escapeTerminalText(selectionError.engine)}, provider=${escapeTerminalText(selectionError.provider)}, model=${escapeTerminalText(selectionError.model)}. This build supports engine=fake, provider=fake, model=fake-reviewer-v1.`,
    ReviewTimeoutError: (timeoutError) =>
      `Review timed out after ${Duration.format(Duration.millis(timeoutError.timeoutMilliseconds))}.`,
    ReviewEngineFailure: (engineError) =>
      `Review engine failed: ${escapeTerminalText(engineError.message)}`,
    GitNotRepositoryError: (repositoryError) =>
      `Not a git repository (or any parent directory); detection exited with code ${repositoryError.exitCode}.`,
    GitWorkingTreeUnavailableError: () =>
      "The current directory is not inside a Git working tree.",
    GitCommandError: renderGitCommandFailure,
    GitCommandTimeoutError: (timeoutError) =>
      `Git ${timeoutError.operation} timed out after ${Duration.format(Duration.millis(timeoutError.timeoutMilliseconds))}.`,
    GitCommandOutputLimitError: (outputLimitError) =>
      `Git ${outputLimitError.operation} produced at least ${outputLimitError.observedOutputBytes} bytes and exceeded the ${outputLimitError.maxOutputBytes} byte combined output limit.`,
    GitCommandProcessError: (processError) =>
      `Git ${processError.operation} failed while reading ${processError.phase}.`,
    GitChangedFileUnavailableError: (unavailableError) =>
      `Changed file became unavailable while reading the diff: ${escapeTerminalText(unavailableError.path)} [${escapeTerminalText(unavailableError.source)}].`,
    GitUnmergedPathsError: (conflictError) =>
      renderUnmergedPaths(conflictError.paths),
    GitInvalidOutputError: (invalidOutputError) =>
      `Git ${invalidOutputError.operation} returned invalid output (${invalidOutputError.outputBytes} byte(s)).`,
    GitExecutionError: renderGitExecutionFailure,
  });
