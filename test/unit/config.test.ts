import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"

import { resolveRun } from "../../src/config/service.ts"
import { parseModelRef, routeEngine } from "../../src/reviewers/registry.ts"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)
const runFail = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flip(effect))

describe("parseModelRef / routeEngine", () => {
  it("parses provider/modelId", () => {
    expect(parseModelRef("openai-codex/gpt-5.5")).toEqual({ provider: "openai-codex", modelId: "gpt-5.5" })
  })

  it("rejects malformed refs", () => {
    expect(parseModelRef("gpt-5.5")).toBeNull()
    expect(parseModelRef("openai/")).toBeNull()
  })

  it("routes anthropic to claude engine, others to pi", () => {
    expect(routeEngine({ provider: "anthropic", modelId: "claude-sonnet-5" })).toBe("claude")
    expect(routeEngine({ provider: "openai-codex", modelId: "gpt-5.5" })).toBe("pi")
    expect(routeEngine({ provider: "anthropic", modelId: "x" }, "pi")).toBe("pi")
  })
})

describe("resolveRun", () => {
  const tsFiles = ["src/a.ts"]

  it("resolves defaults: 3 reviewers on ts diff, risk-balanced engines", async () => {
    const resolved = await run(resolveRun({}, {}, tsFiles))
    expect(resolved.reviewers.map((r) => r.id)).toEqual(["correctness", "security", "typescript"])
    expect(resolved.reviewers.find((r) => r.id === "security")?.engine).toBe("claude")
    expect(resolved.reviewers.find((r) => r.id === "correctness")?.engine).toBe("pi")
    expect(resolved.defaults.failOn).toBe("error")
  })

  it("skips typescript reviewer when no ts files changed", async () => {
    const resolved = await run(resolveRun({}, {}, ["README.md"]))
    expect(resolved.reviewers.map((r) => r.id)).toEqual(["correctness", "security"])
  })

  it("honors --reviewers subset even when appliesTo is false", async () => {
    const resolved = await run(resolveRun({}, { reviewers: ["typescript"] }, ["README.md"]))
    expect(resolved.reviewers.map((r) => r.id)).toEqual(["typescript"])
  })

  it("fails on unknown reviewer id", async () => {
    const error = await runFail(resolveRun({}, { reviewers: ["nope"] }, tsFiles))
    expect(error._tag).toBe("ConfigError")
  })

  it("applies file config overrides (disable + model + engine)", async () => {
    const resolved = await run(
      resolveRun(
        {
          reviewers: {
            typescript: { enabled: false },
            correctness: { model: "anthropic/claude-opus-4-8" },
            security: { engine: "pi" }
          }
        },
        {},
        tsFiles
      )
    )
    expect(resolved.reviewers.map((r) => r.id)).toEqual(["correctness", "security"])
    expect(resolved.reviewers.find((r) => r.id === "correctness")?.engine).toBe("claude")
    expect(resolved.reviewers.find((r) => r.id === "security")?.engine).toBe("pi")
  })

  it("--model overrides all reviewers; --engine overrides routing", async () => {
    const resolved = await run(resolveRun({}, { model: "google/gemini-x", engine: "claude" }, tsFiles))
    expect(new Set(resolved.reviewers.map((r) => r.model.provider))).toEqual(new Set(["google"]))
    expect(new Set(resolved.reviewers.map((r) => r.engine))).toEqual(new Set(["claude"]))
  })

  it("fails on malformed model ref", async () => {
    const error = await runFail(resolveRun({}, { model: "not-a-ref" }, tsFiles))
    expect(error._tag).toBe("ConfigError")
  })

  it("merges timeout/concurrency precedence: flags > file > defaults", async () => {
    const resolved = await run(resolveRun({ timeoutSeconds: 60, concurrency: 5 }, { timeoutSeconds: 30 }, tsFiles))
    expect(resolved.defaults.timeoutMs).toBe(30_000)
    expect(resolved.defaults.concurrency).toBe(5)
  })
})
