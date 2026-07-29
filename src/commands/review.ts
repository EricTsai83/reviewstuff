import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";
import { stagedScope, workingTreeScope } from "../domain/scope";
import {
  renderJsonReport,
  renderTerminalReport,
} from "../output/report-renderer";
import {
  renderJsonRequestPreview,
  renderTerminalRequestPreview,
} from "../output/request-preview-renderer";
import {
  previewReviewRequest,
  type ReviewConfigOverrides,
  runReview,
} from "../use-cases/run-review";
import { renderReviewError } from "./review-error-renderer";

const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDescription("Render command output as JSON."),
);
const dryRunRequestFlag = Flag.boolean("dry-run-request").pipe(
  Flag.withDescription(
    "Preview the exact normalized request without invoking the review engine.",
  ),
);
const stagedFlag = Flag.boolean("staged").pipe(
  Flag.withDescription("Review only changes staged in the index."),
);
const workloadFlag = Flag.choice("workload", ["standard", "light"]).pipe(
  Flag.optional,
  Flag.withDescription("Select the standard or light review workload."),
);
const lightFlag = Flag.boolean("light").pipe(
  Flag.withDescription("Use the light review workload."),
);
const privacyFlag = Flag.choice("privacy", [
  "local-only",
  "cloud-allowed",
]).pipe(
  Flag.optional,
  Flag.withDescription("Control whether cloud review transports are allowed."),
);
const optionalNonEmptyFlag = (name: string, description: string) =>
  Flag.string(name).pipe(
    // Trim first: a whitespace-only value is not a selection, and a padded one
    // must not reach config resolution with its padding intact.
    Flag.map((value) => value.trim()),
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
const directoryFlag = Flag.directory("dir").pipe(
  Flag.optional,
  Flag.withDescription("Select the Git working-tree repository."),
);
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

interface ReviewConfigFlags {
  readonly concurrency: Option.Option<number>;
  readonly engine: Option.Option<string>;
  readonly light: boolean;
  readonly model: Option.Option<string>;
  readonly privacy: Option.Option<"local-only" | "cloud-allowed">;
  readonly provider: Option.Option<string>;
  readonly timeoutMs: Option.Option<number>;
  readonly workload: Option.Option<"standard" | "light">;
}

const collectCliConfigOverrides = (
  flags: ReviewConfigFlags,
): ReviewConfigOverrides => ({
  ...(flags.light
    ? { workload: "light" as const }
    : Option.isSome(flags.workload)
    ? { workload: flags.workload.value }
    : {}),
  ...(Option.isSome(flags.privacy) && { privacy: flags.privacy.value }),
  ...(Option.isSome(flags.engine) && { engine: flags.engine.value }),
  ...(Option.isSome(flags.provider) && { provider: flags.provider.value }),
  ...(Option.isSome(flags.model) && { model: flags.model.value }),
  ...(Option.isSome(flags.timeoutMs) && { timeoutMs: flags.timeoutMs.value }),
  ...(Option.isSome(flags.concurrency) && {
    concurrency: flags.concurrency.value,
  }),
});

export const reviewCommand = Command.make("review", {
  concurrency: concurrencyFlag,
  dir: directoryFlag,
  dryRunRequest: dryRunRequestFlag,
  engine: engineFlag,
  json: jsonFlag,
  light: lightFlag,
  model: modelFlag,
  privacy: privacyFlag,
  provider: providerFlag,
  staged: stagedFlag,
  timeoutMs: timeoutFlag,
  workload: workloadFlag,
}).pipe(
  Command.withDescription("Review local Git changes."),
  Command.withHandler((cliOptions) => {
    if (
      cliOptions.light &&
      Option.isSome(cliOptions.workload) &&
      cliOptions.workload.value === "standard"
    ) {
      return reportCommandFailure(
        "Cannot combine --light with --workload standard.",
      );
    }

    const input = {
      scope: cliOptions.staged ? stagedScope : workingTreeScope,
      ...(Option.isSome(cliOptions.dir) && {
        repositoryPath: cliOptions.dir.value,
      }),
      configOverrides: collectCliConfigOverrides(cliOptions),
    } as const;
    const output = cliOptions.dryRunRequest
      ? previewReviewRequest(input).pipe(
        Effect.map((request) =>
          cliOptions.json
            ? renderJsonRequestPreview(request)
            : renderTerminalRequestPreview(request)
        ),
      )
      : runReview(input).pipe(
        Effect.map((report) =>
          cliOptions.json
            ? renderJsonReport(report)
            : renderTerminalReport(report)
        ),
      );

    return output.pipe(
      Effect.flatMap((rendered) =>
        Console.log(
          rendered,
        ),
      ),
      Effect.matchEffect({
        onFailure: (error) =>
          reportCommandFailure(renderReviewError(error)),
        onSuccess: () => Effect.void,
      }),
    );
  }),
);
