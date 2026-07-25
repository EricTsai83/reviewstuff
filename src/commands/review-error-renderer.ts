import * as Duration from "effect/Duration";
import * as Match from "effect/Match";
import { escapeTerminalText } from "../output/report-renderer";
import type { RunReviewError } from "../use-cases/run-review";

type GitCommandError = Extract<
  RunReviewError,
  { readonly _tag: "GitCommandError" }
>;

function renderGitCommandFailure(error: GitCommandError): string {
  const summary = `Git ${error.operation} failed with exit code ${error.exitCode}.`;
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
}

function renderUnmergedPaths(paths: ReadonlyArray<string>): string {
  return [
    "Review cannot start because unresolved merge conflicts exist:",
    "",
    ...paths.map((path) => `- ${escapeTerminalText(path)}`),
    "",
    "Resolve and stage these files, or abort the merge/rebase, then run review again.",
  ].join("\n");
}

type GitExecutionError = Extract<
  RunReviewError,
  { readonly _tag: "GitExecutionError" }
>;

function renderGitExecutionFailure(error: GitExecutionError): string {
  switch (error.failure) {
    case "command-start":
      return `Unable to start Git while attempting to ${error.operation}.`;
    case "command-termination":
      return `Unable to terminate Git after ${error.operation}.`;
    case "file-inspection":
      return `Unable to ${error.operation} because file inspection failed.`;
  }
}

type ConfigFileParseFailure = Extract<
  RunReviewError,
  { readonly _tag: "ConfigFileParseError" }
>["failure"];

const configParseFailureMessage = (
  failure: ConfigFileParseFailure,
): string => {
  switch (failure) {
    case "alias":
      return "Aliases are not supported.";
    case "anchor":
      return "Anchors are not supported.";
    case "custom-tag":
      return "Custom tags are not supported.";
    case "duplicate-key":
      return "Mapping keys must be unique.";
    case "merge-key":
      return "Merge keys are not supported.";
    case "multiple-documents":
      return "Exactly one YAML document is required.";
    case "non-string-key":
      return "Mapping keys must be strings.";
    case "syntax":
      return "The YAML syntax is invalid.";
    case "unsupported-version":
      return "Only YAML 1.2 is supported.";
    case "unsupported-value":
      return "Only JSON-compatible YAML values are supported.";
    case "warning":
      return "The YAML parser could not interpret the file safely.";
  }
};

export const renderReviewError = (error: RunReviewError): string =>
  Match.valueTags(error, {
    ConfigFileReadError: (configError) =>
      `Unable to read config file ${escapeTerminalText(configError.path)}.`,
    ConfigFileParseError: (configError) =>
      `Invalid YAML config file ${escapeTerminalText(configError.path)} at line ${configError.line}, column ${configError.column}: ${configParseFailureMessage(configError.failure)}`,
    ConfigFileSchemaError: (configError) => {
      const fieldPath = configError.fieldPath.length === 0
        ? "<root>"
        : configError.fieldPath.join(".");

      return `Invalid config file ${escapeTerminalText(configError.path)} at ${fieldPath}: ${configError.constraint}`;
    },
    ReviewSelectionUnsupportedError: (selectionError) =>
      `Unsupported review selection: engine=${escapeTerminalText(selectionError.engine)}, provider=${escapeTerminalText(selectionError.provider)}, model=${escapeTerminalText(selectionError.model)}. This build supports engine=fake, provider=fake, model=fake-reviewer-v1.`,
    ReviewTimeoutError: (timeoutError) =>
      `Review timed out after ${Duration.format(Duration.millis(timeoutError.timeoutMilliseconds))}.`,
    ReviewEngineFailure: (engineError) =>
      `Review engine failed: ${escapeTerminalText(engineError.message)}`,
    GitNotRepositoryError: (repositoryError) =>
      `Not a git repository (or any parent directory); detection exited with code ${repositoryError.exitCode}.`,
    GitRepositoryPathNotFoundError: (repositoryError) =>
      `Repository path does not exist: ${escapeTerminalText(repositoryError.path)}.`,
    GitWorkingTreeUnavailableError: () =>
      "The selected repository is not a Git working tree.",
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
