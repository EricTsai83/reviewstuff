import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { OpenAiStructuredOutput } from "effect/unstable/ai";
import {
  ReviewFindingV1Schema,
  type ReviewFindingV1,
} from "../domain/finding";
import { NonEmptyStringSchema } from "../shared/schema-primitives";
import {
  ReviewEngine,
  ReviewEngineAuthenticationError,
  ReviewEngineConfigurationError,
  ReviewEngineEmptyOutputError,
  type ReviewEngineError,
  type ReviewEngineExecution,
  ReviewEngineIncompleteError,
  ReviewEngineInvalidOutputError,
  ReviewEngineRefusalError,
  ReviewEngineTimeoutError,
  ReviewEngineTransportError,
} from "./review-engine";
import type { ReviewRequestV1 } from "../review/review-request";

export const openAIResponsesEndpoint =
  "https://api.openai.com/v1/responses";

export interface OpenAIResponsesReviewEngineConfig {
  readonly apiKey: string;
  readonly endpoint?: string;
}

export interface OpenAIResponsesTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AbortSignal;
}

export interface OpenAIResponsesTransportResponse {
  readonly status: number;
  readonly body: string;
}

export type OpenAIResponsesTransport = (
  request: OpenAIResponsesTransportRequest,
) => PromiseLike<OpenAIResponsesTransportResponse>;

const OpenAIReviewOutputSchema = Schema.Struct({
  findings: Schema.Array(ReviewFindingV1Schema),
});

const OpenAIResponseEnvelopeSchema = Schema.Struct({
  status: Schema.Literals([
    "completed",
    "failed",
    "in_progress",
    "cancelled",
    "queued",
    "incomplete",
  ]),
  incomplete_details: Schema.NullOr(
    Schema.Struct({ reason: NonEmptyStringSchema }),
  ),
  output: Schema.Array(Schema.Unknown),
});

const OpenAIOutputItemTypeSchema = Schema.Struct({
  type: NonEmptyStringSchema,
});

const OpenAIMessageOutputSchema = Schema.Struct({
  type: Schema.Literal("message"),
  content: Schema.Array(
    Schema.Union([
      Schema.Struct({
        type: Schema.Literal("output_text"),
        text: Schema.String,
      }),
      Schema.Struct({
        type: Schema.Literal("refusal"),
        refusal: NonEmptyStringSchema,
      }),
    ]),
  ),
});

const openAIReviewOutput = OpenAiStructuredOutput.toCodecOpenAI(
  OpenAIReviewOutputSchema,
);

export const openAIReviewOutputJsonSchema =
  openAIReviewOutput.jsonSchema;

const decodeResponseEnvelope = Schema.decodeUnknownEffect(
  OpenAIResponseEnvelopeSchema,
  { onExcessProperty: "ignore" },
);

const decodeOutputItemType = Schema.decodeUnknownEffect(
  OpenAIOutputItemTypeSchema,
  { onExcessProperty: "ignore" },
);

const decodeMessageOutput = Schema.decodeUnknownEffect(
  OpenAIMessageOutputSchema,
  { onExcessProperty: "ignore" },
);

const decodeReviewOutput = Schema.decodeUnknownEffect(
  openAIReviewOutput.codec,
  { onExcessProperty: "error" },
);

const defaultTransport: OpenAIResponsesTransport = async (request) => {
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  });

  return {
    status: response.status,
    body: await response.text(),
  };
};

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

const validateConfiguration = (
  config: OpenAIResponsesReviewEngineConfig,
  execution: ReviewEngineExecution,
): Effect.Effect<
  string,
  ReviewEngineAuthenticationError | ReviewEngineConfigurationError
> => {
  if (config.apiKey.trim().length === 0) {
    return Effect.fail(
      new ReviewEngineAuthenticationError({ provider: "openai" }),
    );
  }

  const endpoint = config.endpoint ?? openAIResponsesEndpoint;

  try {
    const url = new URL(endpoint);
    const isSecure = url.protocol === "https:";
    const isLocalHttp =
      url.protocol === "http:" && url.hostname === "localhost";

    if (!isSecure && !isLocalHttp) {
      throw new Error("The endpoint must use HTTPS.");
    }
  } catch {
    return Effect.fail(
      new ReviewEngineConfigurationError({
        engine: "openai-responses",
        field: "endpoint",
        message: "Expected an HTTPS URL.",
      }),
    );
  }

  if (!isPositiveInteger(execution.timeoutMilliseconds)) {
    return Effect.fail(
      new ReviewEngineConfigurationError({
        engine: "openai-responses",
        field: "timeoutMilliseconds",
        message: "Expected a positive integer.",
      }),
    );
  }

  if (!isPositiveInteger(execution.maxOutputTokens)) {
    return Effect.fail(
      new ReviewEngineConfigurationError({
        engine: "openai-responses",
        field: "maxOutputTokens",
        message: "Expected a positive integer.",
      }),
    );
  }

  return Effect.succeed(endpoint);
};

const buildRequestBody = (
  request: ReviewRequestV1,
  execution: ReviewEngineExecution,
): string =>
  JSON.stringify({
    model: request.options.model,
    instructions: request.systemInstructions,
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({
          prompt: request.prompt,
          context: request.context,
        }),
      }],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "review_findings_v1",
        strict: true,
        schema: openAIReviewOutputJsonSchema,
      },
    },
    max_output_tokens: execution.maxOutputTokens,
    store: false,
  });

const parseJson = (
  value: string,
  stage: "response" | "findings",
): Effect.Effect<unknown, ReviewEngineInvalidOutputError> =>
  Effect.try({
    try: () => JSON.parse(value) as unknown,
    catch: (cause) =>
      new ReviewEngineInvalidOutputError({
        provider: "openai",
        stage,
        cause,
      }),
  });

const decodeEnvelope = (
  input: unknown,
): Effect.Effect<
  typeof OpenAIResponseEnvelopeSchema.Type,
  ReviewEngineInvalidOutputError
> =>
  decodeResponseEnvelope(input).pipe(
    Effect.mapError(
      (cause) =>
        new ReviewEngineInvalidOutputError({
          provider: "openai",
          stage: "response",
          cause,
        }),
    ),
  );

const extractOutputText = (
  output: ReadonlyArray<unknown>,
): Effect.Effect<
  string,
  | ReviewEngineEmptyOutputError
  | ReviewEngineInvalidOutputError
  | ReviewEngineRefusalError
> =>
  Effect.gen(function* () {
    const outputTexts: Array<string> = [];

    for (const item of output) {
      const itemType = yield* decodeOutputItemType(item).pipe(
        Effect.mapError(
          (cause) =>
            new ReviewEngineInvalidOutputError({
              provider: "openai",
              stage: "message",
              cause,
            }),
        ),
      );

      if (itemType.type !== "message") {
        continue;
      }

      const message = yield* decodeMessageOutput(item).pipe(
        Effect.mapError(
          (cause) =>
            new ReviewEngineInvalidOutputError({
              provider: "openai",
              stage: "message",
              cause,
            }),
        ),
      );

      for (const content of message.content) {
        if (content.type === "refusal") {
          return yield* new ReviewEngineRefusalError({
            provider: "openai",
          });
        }

        outputTexts.push(content.text);
      }
    }

    if (outputTexts.length === 0) {
      return yield* new ReviewEngineEmptyOutputError({
        provider: "openai",
      });
    }

    if (outputTexts.length > 1) {
      return yield* new ReviewEngineInvalidOutputError({
        provider: "openai",
        stage: "message",
        cause: new Error("Expected exactly one output_text content item."),
      });
    }

    const outputText = outputTexts[0] ?? "";

    return outputText.trim().length === 0
      ? yield* new ReviewEngineEmptyOutputError({ provider: "openai" })
      : outputText;
  });

const decodeFindings = (
  outputText: string,
): Effect.Effect<
  ReadonlyArray<ReviewFindingV1>,
  ReviewEngineInvalidOutputError
> =>
  parseJson(outputText, "findings").pipe(
    Effect.flatMap(decodeReviewOutput),
    Effect.map((output) => output.findings),
    Effect.mapError((cause) =>
      cause instanceof ReviewEngineInvalidOutputError
        ? cause
        : new ReviewEngineInvalidOutputError({
          provider: "openai",
          stage: "findings",
          cause,
        })
    ),
  );

const review = (
  config: OpenAIResponsesReviewEngineConfig,
  transport: OpenAIResponsesTransport,
  request: ReviewRequestV1,
  execution: ReviewEngineExecution,
): Effect.Effect<ReadonlyArray<ReviewFindingV1>, ReviewEngineError> =>
  Effect.gen(function* () {
    const endpoint = yield* validateConfiguration(config, execution);
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        transport({
          url: endpoint,
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: buildRequestBody(request, execution),
          signal,
        }),
      catch: (cause) =>
        new ReviewEngineTransportError({
          provider: "openai",
          cause,
        }),
    }).pipe(
      Effect.timeoutOrElse({
        duration: execution.timeoutMilliseconds,
        orElse: () =>
          Effect.fail(
            new ReviewEngineTimeoutError({
              provider: "openai",
              timeoutMilliseconds: execution.timeoutMilliseconds,
            }),
          ),
      }),
    );

    if (response.status === 401 || response.status === 403) {
      return yield* new ReviewEngineAuthenticationError({
        provider: "openai",
        statusCode: response.status,
      });
    }

    if (response.status < 200 || response.status >= 300) {
      return yield* new ReviewEngineTransportError({
        provider: "openai",
        statusCode: response.status,
        cause: undefined,
      });
    }

    const envelope = yield* parseJson(response.body, "response").pipe(
      Effect.flatMap(decodeEnvelope),
    );

    if (envelope.status === "incomplete") {
      const reason = envelope.incomplete_details?.reason;

      return yield* new ReviewEngineIncompleteError({
        provider: "openai",
        reason: reason === "max_output_tokens" ||
            reason === "content_filter"
          ? reason
          : "unknown",
      });
    }

    if (envelope.status !== "completed") {
      return yield* new ReviewEngineTransportError({
        provider: "openai",
        cause: new Error(
          `OpenAI response ended with status ${envelope.status}.`,
        ),
      });
    }

    return yield* extractOutputText(envelope.output).pipe(
      Effect.flatMap(decodeFindings),
    );
  });

export const make = (
  config: OpenAIResponsesReviewEngineConfig,
  transport: OpenAIResponsesTransport = defaultTransport,
): ReviewEngine["Service"] =>
  ReviewEngine.of({
    transport: "cloud",
    review: (request, execution) =>
      review(config, transport, request, execution),
  });

export const layer = (
  config: OpenAIResponsesReviewEngineConfig,
  transport?: OpenAIResponsesTransport,
): Layer.Layer<ReviewEngine> =>
  Layer.succeed(
    ReviewEngine,
    make(config, transport),
  );
