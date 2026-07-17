import * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as CommandRunner from "../platform/command-runner";

export type GitProcessPhase = "stdout" | "stderr" | "exit-code";

export class GitNotRepositoryError extends Data.TaggedError(
  "GitNotRepositoryError",
)<{
  readonly exitCode: number;
  readonly stdoutLength: number;
  readonly stderrLength: number;
}> {}

export class GitWorkingTreeUnavailableError extends Data.TaggedError(
  "GitWorkingTreeUnavailableError",
)<{
  readonly stdoutLength: number;
  readonly stderrLength: number;
}> {}

export type GitCommandFailure =
  | "index-locked"
  | "permission-denied"
  | "repository-corrupt"
  | "unsafe-repository"
  | "unknown";

export class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly operation: string;
  readonly exitCode: number;
  readonly stderrLength: number;
  readonly failure: GitCommandFailure;
}> {}

export class GitExecutionError extends Data.TaggedError("GitExecutionError")<{
  readonly operation: string;
  readonly failure:
    | "command-start"
    | "command-termination"
    | "file-inspection";
  readonly cause: unknown;
}> {}

export class GitCommandProcessError extends Data.TaggedError(
  "GitCommandProcessError",
)<{
  readonly operation: string;
  readonly phase: GitProcessPhase;
  readonly cause: unknown;
}> {}

export class GitCommandTimeoutError extends Data.TaggedError(
  "GitCommandTimeoutError",
)<{
  readonly operation: string;
  readonly timeoutMilliseconds: number;
  readonly cause: unknown;
}> {}

export class GitCommandOutputLimitError extends Data.TaggedError(
  "GitCommandOutputLimitError",
)<{
  readonly operation: string;
  readonly maxOutputBytes: number;
  readonly observedOutputBytes: number;
  readonly cause: unknown;
}> {}

export class GitChangedFileUnavailableError extends Data.TaggedError(
  "GitChangedFileUnavailableError",
)<{
  readonly path: string;
  readonly source: import("../domain/review-file").ReviewFileSource;
}> {}

export class GitInvalidOutputError extends Data.TaggedError(
  "GitInvalidOutputError",
)<{
  readonly operation: string;
  readonly outputBytes: number;
}> {}

export class GitUnmergedPathsError extends Data.TaggedError(
  "GitUnmergedPathsError",
)<{
  readonly paths: ReadonlyArray<string>;
}> {}

export type GitError =
  | GitNotRepositoryError
  | GitWorkingTreeUnavailableError
  | GitCommandError
  | GitExecutionError
  | GitCommandProcessError
  | GitCommandTimeoutError
  | GitCommandOutputLimitError
  | GitChangedFileUnavailableError
  | GitInvalidOutputError
  | GitUnmergedPathsError;

export const mapCommandExecutionError = (
  operation: string,
  cause: CommandRunner.CommandExecutionError,
):
  | GitExecutionError
  | GitCommandProcessError
  | GitCommandTimeoutError
  | GitCommandOutputLimitError =>
  Match.valueTags(cause, {
    CommandStartError: (cause) =>
      new GitExecutionError({
        operation,
        failure: "command-start",
        cause,
      }),
    CommandTimeoutError: (cause) =>
      new GitCommandTimeoutError({
        operation,
        timeoutMilliseconds: cause.timeoutMilliseconds,
        cause,
      }),
    CommandOutputLimitError: (cause) =>
      new GitCommandOutputLimitError({
        operation,
        maxOutputBytes: cause.maxOutputBytes,
        observedOutputBytes: cause.observedOutputBytes,
        cause,
      }),
    CommandProcessError: (cause) =>
      new GitCommandProcessError({
        operation,
        phase: cause.phase,
        cause,
      }),
    CommandTerminationError: (cause) =>
      new GitExecutionError({
        operation,
        failure: "command-termination",
        cause,
      }),
  });

export const makeGitCommandError = (
  operation: string,
  result: CommandRunner.CommandResult,
): GitCommandError => {
  const normalizedStderr = result.stderr.toLowerCase();
  let failure: GitCommandFailure = "unknown";

  if (
    normalizedStderr.includes("permission denied") ||
    normalizedStderr.includes("access is denied")
  ) {
    failure = "permission-denied";
  } else if (
    normalizedStderr.includes("dubious ownership") ||
    normalizedStderr.includes("safe.directory")
  ) {
    failure = "unsafe-repository";
  } else if (
    normalizedStderr.includes("index.lock") &&
    (normalizedStderr.includes("file exists") ||
      normalizedStderr.includes("another git process") ||
      normalizedStderr.includes("index is locked"))
  ) {
    failure = "index-locked";
  } else if (
    normalizedStderr.includes("corrupt") ||
    normalizedStderr.includes("bad object") ||
    normalizedStderr.includes("invalid object") ||
    normalizedStderr.includes("index file smaller than expected")
  ) {
    failure = "repository-corrupt";
  }

  return new GitCommandError({
    operation,
    exitCode: result.exitCode,
    stderrLength: result.stderr.length,
    failure,
  });
};
