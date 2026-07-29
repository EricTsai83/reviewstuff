import { expect, test } from "bun:test";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import {
  make,
  reviewEngineImplementations,
  ReviewSelectionUnsupportedError,
  ReviewEngineRegistry,
  layer,
} from "../../src/engines/review-engine-registry";
import { ReviewEngineAuthenticationError } from "../../src/engines/review-engine";

test("registry metadata describes only the available implementations", () => {
  // The table is the single source of engine metadata, including the model
  // policy that used to live in a parallel switch.
  expect(
    reviewEngineImplementations.map((
      { acquire: _acquire, ...metadata },
    ) => metadata),
  ).toEqual([
    {
      engine: "fake",
      provider: "fake",
      defaultModel: "fake-reviewer-v1",
      transport: "local",
      acceptsAnyModel: false,
    },
    {
      engine: "openai",
      provider: "openai",
      transport: "cloud",
      acceptsAnyModel: true,
    },
  ]);
  expect(
    reviewEngineImplementations.every(
      (implementation) => typeof implementation.acquire === "function",
    ),
  ).toBe(true);
});

test("registry resolves the deterministic fake defaults", async () => {
  const resolved = await make().resolve({}).pipe(Effect.runPromise);

  expect(resolved.engineId).toBe("fake");
  expect(resolved.provider).toBe("fake");
  expect(resolved.model).toBe("fake-reviewer-v1");
  expect(resolved.transport).toBe("local");
});

test("registry supplies the OpenAI provider default for an explicit model", async () => {
  const resolved = await make({
    openAIApiKey: Redacted.make("test-api-key"),
    openAITransport: async () => ({
      status: 200,
      body: JSON.stringify({
        status: "completed",
        incomplete_details: null,
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({ findings: [] }),
          }],
        }],
      }),
    }),
  }).resolve({
    engine: "openai",
    model: "gpt-example",
  }).pipe(Effect.runPromise);

  expect(resolved.engineId).toBe("openai");
  expect(resolved.provider).toBe("openai");
  expect(resolved.model).toBe("gpt-example");
  expect(resolved.transport).toBe("cloud");
});

test("registry rejects unsupported combinations with current capabilities", async () => {
  const error = await make().resolve({
    engine: "fake",
    provider: "openai",
  }).pipe(Effect.flip, Effect.runPromise);

  expect(error).toEqual(
    new ReviewSelectionUnsupportedError({
      engine: "fake",
      provider: "openai",
      supportedSelections: [
        "engine=fake, provider=fake, model=fake-reviewer-v1",
        "engine=openai, provider=openai, model=<required>",
      ],
    }),
  );
});

test("registry reports a typed OpenAI credential diagnostic without a key", async () => {
  const resolved = await make().resolve({
    engine: "openai",
    model: "gpt-example",
  }).pipe(Effect.runPromise);
  const error = await resolved.acquire.pipe(
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(
    new ReviewEngineAuthenticationError({ provider: "openai" }),
  );
  expect(JSON.stringify(error)).not.toContain("OPENAI_API_KEY");
});

test("registry requires an explicit model for OpenAI", async () => {
  const error = await make().resolve({
    engine: "openai",
  }).pipe(Effect.flip, Effect.runPromise);

  expect(error).toEqual(
    new ReviewSelectionUnsupportedError({
      engine: "openai",
      supportedSelections: [
        "engine=fake, provider=fake, model=fake-reviewer-v1",
        "engine=openai, provider=openai, model=<required>",
      ],
    }),
  );
});

test("live registry layer reads a non-empty OpenAI key offline", async () => {
  const resolved = await Effect.gen(function* () {
    const registry = yield* ReviewEngineRegistry;
    return yield* registry.resolve({
      engine: "openai",
      model: "gpt-example",
    });
  }).pipe(
    Effect.provide(layer),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        OPENAI_API_KEY: "test-api-key",
      }),
    ),
    Effect.runPromise,
  );

  const engine = await resolved.acquire.pipe(Effect.runPromise);

  expect(engine.transport).toBe("cloud");
});
