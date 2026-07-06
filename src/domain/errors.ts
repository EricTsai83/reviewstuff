import * as Data from "effect/Data"

// ---- git / config ----

export class GitError extends Data.TaggedError("GitError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class NotARepository extends Data.TaggedError("NotARepository")<{
  readonly cwd: string
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ---- engines ----

export class EngineAuthError extends Data.TaggedError("EngineAuthError")<{
  readonly engine: string
  readonly provider: string
  readonly message: string
}> {}

export class EngineTimeout extends Data.TaggedError("EngineTimeout")<{
  readonly engine: string
  readonly reviewer: string
  readonly timeoutMs: number
}> {}

export class EngineFailed extends Data.TaggedError("EngineFailed")<{
  readonly engine: string
  readonly reviewer: string
  readonly message: string
  readonly retryable: boolean
  readonly cause?: unknown
}> {}

export class SchemaParseError extends Data.TaggedError("SchemaParseError")<{
  readonly engine: string
  readonly reviewer: string
  readonly message: string
}> {}

export type EngineError = EngineAuthError | EngineTimeout | EngineFailed | SchemaParseError
