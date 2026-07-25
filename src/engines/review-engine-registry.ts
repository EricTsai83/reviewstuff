import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import type { ReviewTransport } from "../domain/privacy";
import {
  make as makeOpenAIResponsesReviewEngine,
  type OpenAIResponsesTransport,
} from "./openai-responses-review-engine";
import {
  make as makeFakeReviewEngine,
  ReviewEngine,
  ReviewEngineAuthenticationError,
} from "./review-engine";

export interface ReviewEngineSelection {
  readonly engine?: string;
  readonly provider?: string;
  readonly model?: string;
}

export interface ResolvedReviewEngine {
  readonly acquire: Effect.Effect<
    ReviewEngine["Service"],
    ReviewEngineAuthenticationError
  >;
  readonly engineId: string;
  readonly model: string;
  readonly provider: string;
  readonly transport: ReviewTransport;
}

interface ReviewEngineImplementation {
  readonly defaultModel?: string;
  readonly engine: string;
  readonly provider: string;
  readonly transport: ReviewTransport;
}

export const reviewEngineImplementations: ReadonlyArray<
  ReviewEngineImplementation
> = [
  {
    engine: "fake",
    provider: "fake",
    defaultModel: "fake-reviewer-v1",
    transport: "local",
  },
  {
    engine: "openai",
    provider: "openai",
    transport: "cloud",
  },
];

const supportedSelections = reviewEngineImplementations.map(
  ({ defaultModel, engine, provider }) =>
    defaultModel === undefined
      ? `engine=${engine}, provider=${provider}, model=<required>`
      : `engine=${engine}, provider=${provider}, model=${defaultModel}`,
);

export class ReviewSelectionUnsupportedError extends Data.TaggedError(
  "ReviewSelectionUnsupportedError",
)<{
  readonly engine?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly supportedSelections: ReadonlyArray<string>;
}> {}

export type ReviewEngineRegistryError =
  | ReviewSelectionUnsupportedError
  | ReviewEngineAuthenticationError;

export class ReviewEngineRegistry extends Context.Service<
  ReviewEngineRegistry,
  {
    readonly resolve: (
      selection: ReviewEngineSelection,
    ) => Effect.Effect<
      ResolvedReviewEngine,
      ReviewSelectionUnsupportedError
    >;
  }
>()("reviewstuff/ReviewEngineRegistry") {}

export interface ReviewEngineRegistryOptions {
  readonly openAIApiKey?: Redacted.Redacted<string>;
  readonly openAITransport?: OpenAIResponsesTransport;
}

const unsupportedSelection = (
  selection: ReviewEngineSelection,
): ReviewSelectionUnsupportedError =>
  new ReviewSelectionUnsupportedError({
    ...(selection.engine === undefined ? {} : { engine: selection.engine }),
    ...(selection.provider === undefined
      ? {}
      : { provider: selection.provider }),
    ...(selection.model === undefined ? {} : { model: selection.model }),
    supportedSelections,
  });

export const make = (
  options: ReviewEngineRegistryOptions = {},
): ReviewEngineRegistry["Service"] =>
  ReviewEngineRegistry.of({
    resolve: (selection) =>
      Effect.gen(function* () {
        const engineId = selection.engine ?? "fake";
        const implementation = reviewEngineImplementations.find(
          (candidate) => candidate.engine === engineId,
        );

        if (implementation === undefined) {
          return yield* unsupportedSelection(selection);
        }

        const provider = selection.provider ?? implementation.provider;
        const model = selection.model ?? implementation.defaultModel;
        const providerMatches = provider === implementation.provider;
        const modelMatches = engineId === "openai"
          ? model !== undefined
          : model === implementation.defaultModel;

        if (!providerMatches || !modelMatches || model === undefined) {
          return yield* unsupportedSelection(selection);
        }

        if (engineId === "fake") {
          return {
            acquire: Effect.succeed(makeFakeReviewEngine),
            engineId,
            model,
            provider,
            transport: implementation.transport,
          };
        }

        const apiKey = options.openAIApiKey;

        return {
          acquire:
            apiKey === undefined ||
              Redacted.value(apiKey).trim().length === 0
              ? Effect.fail(
                new ReviewEngineAuthenticationError({
                  provider: "openai",
                }),
              )
              : Effect.succeed(
                makeOpenAIResponsesReviewEngine(
                  { apiKey: Redacted.value(apiKey) },
                  options.openAITransport,
                ),
              ),
          engineId,
          model,
          provider,
          transport: implementation.transport,
        };
      }),
  });

const makeLive = Config.redacted("OPENAI_API_KEY").pipe(
  Config.option,
  Effect.map((apiKey) =>
    make({
      ...(Option.isSome(apiKey) && { openAIApiKey: apiKey.value }),
    })
  ),
  Effect.orElseSucceed(() => make()),
);

export const layer = Layer.effect(
  ReviewEngineRegistry,
  makeLive,
);
