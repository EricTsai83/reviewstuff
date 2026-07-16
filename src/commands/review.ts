import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";
import { stagedScope, workingTreeScope } from "../domain/scope";
import {
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
  ),
);
