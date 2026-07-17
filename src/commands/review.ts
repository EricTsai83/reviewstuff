import * as Console from "effect/Console";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";
import { stagedScope, workingTreeScope } from "../domain/scope";
import { renderGitCommandError } from "../output/command-error-renderer";
import {
  escapeTerminalText,
  renderJsonReport,
  renderTerminalReport,
} from "../output/report-renderer";
import { runReview } from "../use-cases/run-review";

const json = Flag.boolean("json").pipe(
  Flag.withDescription("Render the versioned report as JSON."),
);
const staged = Flag.boolean("staged").pipe(
  Flag.withDescription("Review only changes staged in the index."),
);

const exitWithError = (message: string) =>
  Console.error(message).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );

const formatMilliseconds = (milliseconds: number): string =>
  Duration.format(Duration.millis(milliseconds));

const renderUnmergedPathsError = (
  paths: ReadonlyArray<string>,
): string =>
  [
    "Review cannot start because unresolved merge conflicts exist:",
    "",
    ...paths.map((path) => `- ${escapeTerminalText(path)}`),
    "",
    "Resolve and stage these files, or abort the merge/rebase, then run review again.",
  ].join("\n");

export const reviewCommand = Command.make("review", { json, staged }).pipe(
  Command.withDescription("Review local Git changes."),
  Command.withHandler(({ json: useJson, staged: stagedOnly }) =>
    runReview(stagedOnly ? stagedScope : workingTreeScope).pipe(
      Effect.flatMap((report) =>
        Console.log(
          useJson ? renderJsonReport(report) : renderTerminalReport(report),
        ),
      ),
      Effect.catchTags({
        GitNotRepositoryError: (error) =>
          exitWithError(
            `Not a git repository (or any parent directory); detection exited with code ${error.exitCode}.`,
          ),
        GitWorkingTreeUnavailableError: () =>
          exitWithError(
            "The current directory is not inside a Git working tree.",
          ),
        GitCommandError: (error) =>
          exitWithError(renderGitCommandError(error)),
        GitCommandTimeoutError: (error) =>
          exitWithError(
            `Git ${error.operation} timed out after ${formatMilliseconds(error.timeoutMilliseconds)}.`,
          ),
        GitCommandOutputLimitError: (error) =>
          exitWithError(
            `Git ${error.operation} produced at least ${error.observedOutputBytes} bytes and exceeded the ${error.maxOutputBytes} byte combined output limit.`,
          ),
        GitCommandProcessError: (error) =>
          exitWithError(
            `Git ${error.operation} failed while reading ${error.phase}.`,
          ),
        GitChangedFileUnavailableError: (error) =>
          exitWithError(
            `Changed file became unavailable while reading the diff: ${escapeTerminalText(error.path)} [${escapeTerminalText(error.source)}].`,
          ),
        GitUnmergedPathsError: (error) =>
          exitWithError(renderUnmergedPathsError(error.paths)),
        GitInvalidOutputError: (error) =>
          exitWithError(
            `Git ${error.operation} returned invalid output (${error.outputBytes} byte(s)).`,
          ),
        GitExecutionError: (error) =>
          exitWithError(
            error.failure === "command-start"
              ? `Unable to start Git while attempting to ${error.operation}.`
              : error.failure === "command-termination"
              ? `Unable to terminate Git after ${error.operation}.`
              : `Unable to ${error.operation} because file inspection failed.`,
          ),
      }),
    ),
  ),
);
