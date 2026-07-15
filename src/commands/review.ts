import { Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { stagedScope, workingTreeScope } from "../domain/scope";
import {
  renderJsonReport,
  renderTerminalReport,
} from "../output/report-renderer";
import { runReview } from "../use-cases/run-review";

const json = Options.boolean("json").pipe(
  Options.withDescription("Render the versioned report as JSON."),
);
const staged = Options.boolean("staged").pipe(
  Options.withDescription("Review only changes staged in the index."),
);

const exitWithError = (message: string) =>
  Console.error(message).pipe(
    Effect.zipRight(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );

export const reviewCommand = Command.make(
  "review",
  { json, staged },
  ({ json: useJson, staged: stagedOnly }) =>
    runReview(stagedOnly ? stagedScope : workingTreeScope).pipe(
      Effect.flatMap((report) =>
        Console.log(
          useJson ? renderJsonReport(report) : renderTerminalReport(report),
        ),
      ),
      Effect.catchTags({
        GitNotRepositoryError: () =>
          exitWithError("Not a git repository (or any parent directory)."),
        GitCommandError: (error) =>
          exitWithError(
            `Git ${error.operation} failed with exit code ${error.exitCode}.`,
          ),
        GitExecutionError: (error) =>
          exitWithError(`Unable to ${error.operation}.`),
      }),
    ),
).pipe(Command.withDescription("Review local Git changes."));
