import { execFile } from "node:child_process"

import * as Effect from "effect/Effect"

export interface ExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export class ExecError {
  readonly _tag = "ExecError"
  constructor(
    readonly command: string,
    readonly cause: unknown
  ) {}
}

/**
 * Effect 邊界的 subprocess helper（effect v4 beta 的 unstable/process 仍是低階 stream API，
 * 這裡刻意用 node:child_process 保持穩定；非零 exit code 不算失敗，由呼叫端決定）。
 */
export const runCommand = (
  command: string,
  args: readonly string[],
  options?: {
    readonly cwd?: string
    readonly stdin?: string
    readonly timeoutMs?: number
    readonly maxBuffer?: number
  }
): Effect.Effect<ExecResult, ExecError> =>
  Effect.callback<ExecResult, ExecError>((resume) => {
    const child = execFile(
      command,
      [...args],
      {
        cwd: options?.cwd,
        timeout: options?.timeoutMs,
        maxBuffer: options?.maxBuffer ?? 32 * 1024 * 1024,
        encoding: "utf8"
      },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resume(Effect.fail(new ExecError(command, error)))
          return
        }
        if (error && error.killed) {
          resume(Effect.fail(new ExecError(command, error)))
          return
        }
        const exitCode =
          error && typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code: number }).code as number)
            : error
              ? 1
              : 0
        resume(Effect.succeed({ stdout, stderr, exitCode }))
      }
    )

    if (options?.stdin !== undefined) {
      child.stdin?.write(options.stdin)
      child.stdin?.end()
    }

    return Effect.sync(() => {
      child.kill("SIGTERM")
    })
  })
