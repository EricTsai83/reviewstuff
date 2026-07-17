import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";
import { stagedScope, workingTreeScope } from "../domain/scope";
import {
  renderJsonReport,
  renderTerminalReport,
} from "../output/report-renderer";
import { runReview } from "../use-cases/run-review";
import { renderReviewError } from "./review-error-renderer";

const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDescription("Render the versioned report as JSON."),
);
const stagedFlag = Flag.boolean("staged").pipe(
  Flag.withDescription("Review only changes staged in the index."),
);

const reportCommandFailure = (message: string) =>
  Console.error(message).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );

export const reviewCommand = Command.make("review", {
  json: jsonFlag,
  staged: stagedFlag,
}).pipe(
  Command.withDescription("Review local Git changes."),
  Command.withHandler(({ json: useJson, staged: stagedOnly }) =>
    runReview(stagedOnly ? stagedScope : workingTreeScope).pipe(
      Effect.flatMap((report) =>
        Console.log(
          useJson ? renderJsonReport(report) : renderTerminalReport(report),
        ),
      ),
      Effect.matchEffect({
        onFailure: (error) =>
          reportCommandFailure(renderReviewError(error)),
        onSuccess: () => Effect.void,
      }),
    ),
  ),
);
