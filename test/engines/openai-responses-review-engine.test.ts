import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as OpenAIResponsesReviewEngine from
  "../../src/engines/openai-responses-review-engine";
import {
  ReviewEngineAuthenticationError,
  ReviewEngineConfigurationError,
  ReviewEngineEmptyOutputError,
  type ReviewEngineExecution,
  ReviewEngineIncompleteError,
  ReviewEngineInvalidOutputError,
  ReviewEngineRefusalError,
  ReviewEngineResponseTooLargeError,
  ReviewEngineTimeoutError,
  ReviewEngineTransportError,
} from "../../src/engines/review-engine";
import {
  buildReviewRequestV1,
  type ReviewRequestV1,
} from "../../src/review/review-request";

type Transport =
  OpenAIResponsesReviewEngine.OpenAIResponsesTransport;
type TransportRequest =
  OpenAIResponsesReviewEngine.OpenAIResponsesTransportRequest;

const execution: ReviewEngineExecution = {
  concurrency: 2,
  timeoutMilliseconds: 1_000,
  maxOutputTokens: 4_096,
};

const request: ReviewRequestV1 = buildReviewRequestV1({
  repository: { scope: "working-tree" },
  config: { model: "gpt-5.6" },
  files: [{
    path: "src/example.ts",
    source: "working-tree",
    patch: "@@ -3,1 +3,2 @@\n existing();\n+changed();",
  }],
});

const readFixture = async (name: string): Promise<string> =>
  Bun.file(
    `${import.meta.dir}/../fixtures/openai-responses/${name}.json`,
  ).text();

const fixtureTransport = (
  name: string,
  capture?: (request: TransportRequest) => void,
): Transport =>
  async (transportRequest) => {
    capture?.(transportRequest);

    return {
      status: 200,
      body: await readFixture(name),
    };
  };

const runReview = (
  transport: Transport,
  reviewExecution: ReviewEngineExecution = execution,
) =>
  OpenAIResponsesReviewEngine.make(
    { apiKey: "test-api-key" },
    transport,
  ).review(request, reviewExecution).pipe(Effect.runPromise);

const runFailure = (
  transport: Transport,
  reviewExecution: ReviewEngineExecution = execution,
) =>
  OpenAIResponsesReviewEngine.make(
    { apiKey: "test-api-key" },
    transport,
  ).review(request, reviewExecution).pipe(
    Effect.flip,
    Effect.runPromise,
  );

test("maps ReviewRequestV1 to a non-stored strict Responses request and decodes findings", async () => {
  let outbound: TransportRequest | undefined;

  expect(
    await runReview(
      fixtureTransport("completed", (request) => {
        outbound = request;
      }),
    ),
  ).toEqual([{
    id: "finding-1",
    ruleId: "unchecked-result",
    severity: "high",
    category: "correctness",
    confidence: 0.95,
    message: "The error result is ignored.",
    file: "src/example.ts",
    line: 4,
  }]);

  expect(outbound?.url).toBe(
    OpenAIResponsesReviewEngine.openAIResponsesEndpoint,
  );
  expect(outbound?.headers).toEqual({
    authorization: "Bearer test-api-key",
    "content-type": "application/json",
  });

  const body = JSON.parse(outbound?.body ?? "") as unknown;
  expect(body).toMatchObject({
    model: "gpt-5.6",
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
        schema: OpenAIResponsesReviewEngine.openAIReviewOutputJsonSchema,
      },
    },
    max_output_tokens: 4_096,
    store: false,
  });
  expect(OpenAIResponsesReviewEngine.openAIReviewOutputJsonSchema)
    .toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["findings"],
    });
});

test("maps a structured refusal to a typed error", async () => {
  const error = await runFailure(fixtureTransport("refusal"));

  expect(error).toEqual(
    new ReviewEngineRefusalError({
      provider: "openai",
    }),
  );
  expect(JSON.stringify(error)).not.toContain(
    "I cannot review this request.",
  );
});

test("maps incomplete output and its reason to a typed error", async () => {
  const error = await runFailure(fixtureTransport("incomplete"));
  const unknownReason = await runFailure(async () => ({
    status: 200,
    body: JSON.stringify({
      status: "incomplete",
      incomplete_details: { reason: "future-provider-reason" },
      output: [],
    }),
  }));

  expect(error).toEqual(
    new ReviewEngineIncompleteError({
      provider: "openai",
      reason: "max_output_tokens",
    }),
  );
  expect(unknownReason).toEqual(
    new ReviewEngineIncompleteError({
      provider: "openai",
      reason: "unknown",
    }),
  );
  expect(JSON.stringify(unknownReason)).not.toContain(
    "future-provider-reason",
  );
});

test("ignores non-message output items but rejects a response with no review message", async () => {
  const nonMessage = await runFailure(
    fixtureTransport("non-message-output"),
  );
  const blankText = await runFailure(fixtureTransport("empty"));

  expect(nonMessage).toEqual(
    new ReviewEngineEmptyOutputError({ provider: "openai" }),
  );
  expect(blankText).toEqual(
    new ReviewEngineEmptyOutputError({ provider: "openai" }),
  );
});

test("rejects malformed JSON and schema-invalid findings at the Effect decode boundary", async () => {
  const malformedResponse = await runFailure(async () => ({
    status: 200,
    body: "{",
  }));
  const malformedFindings = await runFailure(async () => ({
    status: 200,
    body: JSON.stringify({
      status: "completed",
      incomplete_details: null,
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "{" }],
      }],
    }),
  }));
  const invalidFinding = await runFailure(async () => ({
    status: 200,
    body: JSON.stringify({
      status: "completed",
      incomplete_details: null,
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            findings: [{
              id: "finding-1",
              ruleId: "invalid-line",
              severity: "medium",
              category: "correctness",
              confidence: 1,
              message: "Invalid line.",
              file: "src/example.ts",
              line: 0,
            }],
          }),
        }],
      }],
    }),
  }));

  expect(malformedResponse)
    .toBeInstanceOf(ReviewEngineInvalidOutputError);
  if (!(malformedResponse instanceof ReviewEngineInvalidOutputError)) {
    throw new Error("Expected malformed JSON to fail output validation.");
  }
  expect(malformedResponse.stage).toBe("response");
  expect(malformedFindings)
    .toBeInstanceOf(ReviewEngineInvalidOutputError);
  if (!(malformedFindings instanceof ReviewEngineInvalidOutputError)) {
    throw new Error("Expected malformed findings JSON to fail.");
  }
  expect(malformedFindings.stage).toBe("findings");
  expect(invalidFinding).toBeInstanceOf(ReviewEngineInvalidOutputError);
  if (!(invalidFinding instanceof ReviewEngineInvalidOutputError)) {
    throw new Error("Expected finding schema validation to fail.");
  }
  expect(invalidFinding.stage).toBe("findings");
});

test("maps transport rejection and non-success HTTP responses without exposing response bodies", async () => {
  const rejection = new Error("network unavailable");
  const transportError = await runFailure(async () => {
    throw rejection;
  });
  const httpError = await runFailure(async () => ({
    status: 429,
    body: "provider-sensitive-body",
  }));

  expect(transportError).toEqual(
    new ReviewEngineTransportError({
      provider: "openai",
      cause: rejection,
    }),
  );
  expect(httpError).toEqual(
    new ReviewEngineTransportError({
      provider: "openai",
      statusCode: 429,
      cause: undefined,
    }),
  );
  expect(JSON.stringify(httpError)).not.toContain(
    "provider-sensitive-body",
  );
});

test("maps missing credentials and provider auth responses to typed authentication errors", async () => {
  let transportCalls = 0;
  const transport: Transport = async () => {
    transportCalls += 1;
    return { status: 401, body: "{}" };
  };
  const missingCredential = await OpenAIResponsesReviewEngine.make(
    { apiKey: "" },
    transport,
  ).review(request, execution).pipe(Effect.flip, Effect.runPromise);
  const rejectedCredential = await runFailure(transport);

  expect(missingCredential).toEqual(
    new ReviewEngineAuthenticationError({ provider: "openai" }),
  );
  expect(rejectedCredential).toEqual(
    new ReviewEngineAuthenticationError({
      provider: "openai",
      statusCode: 401,
    }),
  );
  expect(transportCalls).toBe(1);
});

test("validates execution config before transport", async () => {
  let transportCalls = 0;
  const transport: Transport = async () => {
    transportCalls += 1;
    return { status: 200, body: await readFixture("completed") };
  };
  const invalidOutputCap = await runFailure(
    transport,
    { ...execution, maxOutputTokens: 0 },
  );
  const invalidEndpoint = await OpenAIResponsesReviewEngine.make(
    {
      apiKey: "test-api-key",
      endpoint: "file://localhost/tmp/responses",
    },
    transport,
  ).review(request, execution).pipe(Effect.flip, Effect.runPromise);

  expect(invalidOutputCap).toEqual(
    new ReviewEngineConfigurationError({
      engine: "openai-responses",
      field: "maxOutputTokens",
      message: "Expected a positive integer.",
    }),
  );
  expect(invalidEndpoint).toEqual(
    new ReviewEngineConfigurationError({
      engine: "openai-responses",
      field: "endpoint",
      message: "Expected an HTTPS URL.",
    }),
  );
  expect(transportCalls).toBe(0);
});

test("aborts transport and returns a typed timeout", async () => {
  let aborted = false;
  const error = await runFailure(
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
    { ...execution, timeoutMilliseconds: 5 },
  );

  expect(error).toEqual(
    new ReviewEngineTimeoutError({
      provider: "openai",
      timeoutMilliseconds: 5,
    }),
  );
  expect(aborted).toBe(true);
});

test("decodes a completed response that omits incomplete_details", async () => {
  const transport: Transport = async () => ({
    status: 200,
    body: JSON.stringify({
      status: "completed",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({ findings: [] }),
        }],
      }],
    }),
  });

  expect(await runReview(transport)).toEqual([]);
});

test.each([
  ["failed", "failed"],
  ["in progress", "in_progress"],
  ["queued", "queued"],
])(
  "reports a %s envelope with the provider's own identifiers",
  async (_name, status) => {
    const transport: Transport = async () => ({
      status: 200,
      body: JSON.stringify({
        status,
        incomplete_details: null,
        error: { type: "server_error", code: "internal_error" },
        output: [],
      }),
    });

    const error = await runFailure(transport);

    expect(error).toBeInstanceOf(ReviewEngineTransportError);
    if (!(error instanceof ReviewEngineTransportError)) {
      throw new Error("Expected ReviewEngineTransportError");
    }
    expect(error.errorType).toBe("server_error");
    expect(error.errorCode).toBe("internal_error");
  },
);

test("keeps a non-2xx body out of the error while reporting its identifiers", async () => {
  const secretish = "org-private-diagnostic-text";
  const transport: Transport = async () => ({
    status: 500,
    body: JSON.stringify({
      error: {
        type: "server_error",
        code: "engine_overloaded",
        message: secretish,
      },
    }),
  });

  const error = await runFailure(transport);

  expect(error).toBeInstanceOf(ReviewEngineTransportError);
  if (!(error instanceof ReviewEngineTransportError)) {
    throw new Error("Expected ReviewEngineTransportError");
  }
  expect(error.statusCode).toBe(500);
  expect(error.errorType).toBe("server_error");
  expect(error.errorCode).toBe("engine_overloaded");
  expect(JSON.stringify(error)).not.toContain(secretish);
});

test("parses findings split across several output_text parts", async () => {
  const findings = JSON.stringify({
    findings: [{
      id: "finding-1",
      ruleId: "openai-review",
      severity: "medium",
      category: "correctness",
      confidence: 0.5,
      message: "Split output.",
      file: "src/example.ts",
      line: 3,
    }],
  });
  const transport: Transport = async () => ({
    status: 200,
    body: JSON.stringify({
      status: "completed",
      output: [{
        type: "message",
        content: [
          { type: "output_text", text: findings.slice(0, 20) },
          { type: "output_text", text: findings.slice(20) },
        ],
      }],
    }),
  });

  expect(await runReview(transport)).toEqual([{
    id: "finding-1",
    ruleId: "openai-review",
    severity: "medium",
    category: "correctness",
    confidence: 0.5,
    message: "Split output.",
    file: "src/example.ts",
    line: 3,
  }]);
});

test("the bounded reader stops at the limit and decodes split characters", async () => {
  const streamed = (chunks: ReadonlyArray<Uint8Array>): Response =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
    );
  const encoded = Buffer.from("審查中文", "utf8");

  // A multi-byte character split across chunks must survive the incremental
  // decode, including the final flush.
  expect(
    await OpenAIResponsesReviewEngine.readBoundedResponseBody(
      streamed([
        new Uint8Array(encoded.subarray(0, 2)),
        new Uint8Array(encoded.subarray(2)),
      ]),
      1_024,
    ),
  ).toBe("審查中文");

  const oversized = OpenAIResponsesReviewEngine.readBoundedResponseBody(
    streamed([new Uint8Array(700).fill(120), new Uint8Array(700).fill(120)]),
    1_024,
  );

  await expect(oversized).rejects.toBeInstanceOf(
    OpenAIResponsesReviewEngine.OpenAIResponsesResponseLimitError,
  );
});

test("maps a response over the read limit to a bounded typed error", async () => {
  let requestedLimit: number | undefined;
  const transport: Transport = async (transportRequest) => {
    requestedLimit = transportRequest.maxResponseBytes;

    throw new OpenAIResponsesReviewEngine.OpenAIResponsesResponseLimitError(
      1_024,
      2_048,
    );
  };

  const error = await runFailure(transport);

  expect(requestedLimit).toBe(
    OpenAIResponsesReviewEngine.openAIResponsesMaxResponseBytes,
  );
  expect(error).toBeInstanceOf(ReviewEngineResponseTooLargeError);
  if (!(error instanceof ReviewEngineResponseTooLargeError)) {
    throw new Error("Expected ReviewEngineResponseTooLargeError");
  }
  expect(error.maxBytes).toBe(1_024);
  expect(error.observedBytes).toBe(2_048);
});

test("accepts an http localhost endpoint without weakening the HTTPS rule", async () => {
  // A local mock provider is the one non-HTTPS endpoint allowed; the transport
  // classification stays "cloud" so privacy enforcement is unaffected.
  const engine = OpenAIResponsesReviewEngine.make(
    { apiKey: "test-api-key", endpoint: "http://localhost:8080/v1/responses" },
    fixtureTransport("completed"),
  );

  expect(engine.transport).toBe("cloud");
  expect(await engine.review(request, execution).pipe(Effect.runPromise))
    .toHaveLength(1);

  const remoteHttp = await OpenAIResponsesReviewEngine.make(
    { apiKey: "test-api-key", endpoint: "http://example.com/v1/responses" },
    fixtureTransport("completed"),
  ).review(request, execution).pipe(Effect.flip, Effect.runPromise);

  expect(remoteHttp).toEqual(
    new ReviewEngineConfigurationError({
      engine: "openai-responses",
      field: "endpoint",
      message: "Expected an HTTPS URL.",
    }),
  );
});
