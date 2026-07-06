import * as Layer from "effect/Layer"

import { ClaudeEngine } from "./engines/claude.ts"
import { Engines } from "./engines/engine.ts"
import { makeFakeEngines } from "./engines/fake.ts"
import { PiEngine } from "./engines/pi.ts"
import { GitServiceLive } from "./git/service.ts"

const EnginesLive = Layer.succeed(Engines, {
  get: (id) => (id === "claude" ? ClaudeEngine : PiEngine)
})

/** AI_REVIEW_FAKE_ENGINE=1：binary 層 e2e 用的決定性引擎。 */
const EnginesFake = Layer.succeed(Engines, makeFakeEngines().engines)

export const AppLive = Layer.mergeAll(
  GitServiceLive,
  process.env["AI_REVIEW_FAKE_ENGINE"] === "1" ? EnginesFake : EnginesLive
)
