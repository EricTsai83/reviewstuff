import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
const profileFlag = Flag.choice("profile", ["quick", "standard"]).pipe(
  Flag.optional,
  Flag.withDescription("Select the quick or standard review profile."),
);
const optionalNonEmptyFlag = (name: string, description: string) =>
  Flag.string(name).pipe(
    Flag.filter((value) => value.length > 0, () => `${name} must not be empty`),
    Flag.optional,
    Flag.withDescription(description),
  );
const engineFlag = optionalNonEmptyFlag("engine", "Override the review engine.");
const providerFlag = optionalNonEmptyFlag(
  "provider",
  "Override the review provider.",
);
const modelFlag = optionalNonEmptyFlag("model", "Override the reviewer model.");
const optionalPositiveIntegerFlag = (name: string, description: string) =>
  Flag.integer(name).pipe(
    Flag.filter((value) => value > 0, () => `${name} must be greater than 0`),
    Flag.optional,
    Flag.withDescription(description),
  );
const timeoutFlag = optionalPositiveIntegerFlag(
  "timeout-ms",
  "Override the review timeout in milliseconds.",
);
const concurrencyFlag = optionalPositiveIntegerFlag(
  "concurrency",
  "Override review concurrency.",
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
  concurrency: concurrencyFlag,
  engine: engineFlag,
  json: jsonFlag,
  model: modelFlag,
  profile: profileFlag,
  provider: providerFlag,
  staged: stagedFlag,
  timeoutMs: timeoutFlag,
}).pipe(
  Command.withDescription("Review local Git changes."),
  Command.withHandler((options) =>
    runReview(options.staged ? stagedScope : workingTreeScope, {
      ...(Option.isSome(options.profile)
        ? { profile: options.profile.value }
        : {}),
      ...(Option.isSome(options.engine) ? { engine: options.engine.value } : {}),
      ...(Option.isSome(options.provider)
        ? { provider: options.provider.value }
        : {}),
      ...(Option.isSome(options.model) ? { model: options.model.value } : {}),
      ...(Option.isSome(options.timeoutMs)
        ? { timeoutMs: options.timeoutMs.value }
        : {}),
      ...(Option.isSome(options.concurrency)
        ? { concurrency: options.concurrency.value }
        : {}),
    }).pipe(
      Effect.flatMap((report) =>
        Console.log(
          options.json
            ? renderJsonReport(report)
            : renderTerminalReport(report),
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
