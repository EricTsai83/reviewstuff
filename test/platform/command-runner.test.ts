import * as CommandExecutor from "@effect/platform/CommandExecutor";
import * as PlatformError from "@effect/platform/Error";
import { BunContext } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect, Fiber, Inspectable, Layer, Sink, Stream } from "effect";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CommandOutputLimitError,
  CommandProcessError,
  CommandRunner,
  CommandStartError,
  CommandTimeoutError,
  layer,
} from "../../src/platform/command-runner";

const live = layer.pipe(Layer.provideMerge(BunContext.layer));

class FakeProcess implements CommandExecutor.Process {
  readonly [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId =
    CommandExecutor.ProcessTypeId;
  readonly pid = CommandExecutor.ProcessId(1);
  readonly isRunning = Effect.succeed(false);
  readonly kill: CommandExecutor.Process["kill"] = () => Effect.void;
  readonly stdin: CommandExecutor.Process["stdin"] = Sink.drain;
  readonly stderr: CommandExecutor.Process["stderr"] = Stream.empty;

  constructor(
    readonly stdout: CommandExecutor.Process["stdout"],
    readonly exitCode: CommandExecutor.Process["exitCode"],
  ) {}

  toJSON(): unknown {
    return { pid: this.pid };
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }

  [Inspectable.NodeInspectSymbol](): unknown {
    return this.toJSON();
  }
}

const platformError = (method: string) =>
  new PlatformError.SystemError({
    reason: "Unknown",
    module: "Command",
    method,
  });

const runWithProcess = (process: CommandExecutor.Process) => {
  const executor = CommandExecutor.makeExecutor(() => Effect.succeed(process));
  const testLayer = layer.pipe(
    Layer.provide(
      Layer.succeed(CommandExecutor.CommandExecutor, executor),
    ),
  );

  return CommandRunner.pipe(
    Effect.flatMap((runner) =>
      runner.run({
        program: "fake-command",
        timeout: "1 second",
        maxOutputBytes: 1_000,
      }),
    ),
    Effect.provide(testLayer),
  );
};

const isProcessRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const run = (args: ReadonlyArray<string>, maxOutputBytes = 1024 * 1024) =>
  CommandRunner.pipe(
    Effect.flatMap((runner) =>
      runner.run({
        program: process.execPath,
        args,
        timeout: "5 seconds",
        maxOutputBytes,
      }),
    ),
    Effect.provide(live),
  );

describe("CommandRunner", () => {
  test("drains stdout and stderr concurrently", async () => {
    const size = 128 * 1024;
    const result = await run([
      "-e",
      `process.stdout.write("o".repeat(${size})); process.stderr.write("e".repeat(${size}));`,
    ]).pipe(Effect.runPromise);

    expect(result.stdout).toBe("o".repeat(size));
    expect(result.stderr).toBe("e".repeat(size));
    expect(result.exitCode).toBe(0);
  });

  test("returns stdout, stderr, and a non-zero exit code", async () => {
    const result = await run([
      "-e",
      'console.log("out"); console.error("err"); process.exit(7);',
    ]).pipe(Effect.runPromise);

    expect(result).toEqual({ stdout: "out\n", stderr: "err\n", exitCode: 7 });
  });

  test("fails when combined output crosses the byte limit", async () => {
    const error = await run(
      [
        "-e",
        'process.stdout.write("o".repeat(700)); process.stderr.write("e".repeat(700));',
      ],
      1_000,
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(CommandOutputLimitError);
  });

  test("maps process startup failures", async () => {
    const error = await CommandRunner.pipe(
      Effect.flatMap((runner) =>
        runner.run({
          program: `reviewstuff-command-that-does-not-exist-${Date.now()}`,
          timeout: "1 second",
          maxOutputBytes: 1_000,
        }),
      ),
      Effect.provide(live),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(CommandStartError);
  });

  test("maps stdout failures after startup to CommandProcessError", async () => {
    const cause = platformError("stdout");
    const error = await runWithProcess(
      new FakeProcess(
        Stream.fail(cause),
        Effect.succeed(CommandExecutor.ExitCode(0)),
      ),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(CommandProcessError);
    if (!(error instanceof CommandProcessError)) {
      throw new Error("Expected CommandProcessError");
    }

    expect(error.phase).toBe("stdout");
    expect(error.cause).toBe(cause);
  });

  test("maps exit-code failures after startup to CommandProcessError", async () => {
    const cause = platformError("exitCode");
    const error = await runWithProcess(
      new FakeProcess(Stream.empty, Effect.fail(cause)),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(CommandProcessError);
    if (!(error instanceof CommandProcessError)) {
      throw new Error("Expected CommandProcessError");
    }

    expect(error.phase).toBe("exit-code");
    expect(error.cause).toBe(cause);
  });

  test("times out and terminates the child process", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "reviewstuff-command-runner-"),
    );
    const readyFile = `${directory}/ready`;

    const error = await CommandRunner.pipe(
      Effect.flatMap((runner) =>
        runner.run({
          program: process.execPath,
          args: [
            "-e",
            'const file = Bun.argv.at(-1); await Bun.write(file, String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);',
            readyFile,
          ],
          timeout: "200 millis",
          maxOutputBytes: 1_000,
        }),
      ),
      Effect.provide(live),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(CommandTimeoutError);
    const pid = Number(await Bun.file(readyFile).text());
    expect(isProcessRunning(pid)).toBe(false);
  });

  test("interruption terminates the child process", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "reviewstuff-command-runner-"),
    );
    const readyFile = `${directory}/ready`;

    const effect = CommandRunner.pipe(
      Effect.flatMap((runner) =>
        runner.run({
          program: process.execPath,
          args: [
            "-e",
            'const ready = Bun.argv.at(-1); await Bun.write(ready, String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);',
            readyFile,
          ],
          timeout: "10 seconds",
          maxOutputBytes: 1_000,
        }),
      ),
      Effect.provide(live),
    );
    const fiber = Effect.runFork(effect);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await Bun.file(readyFile).exists()) {
        break;
      }

      await Bun.sleep(10);
    }

    const pid = Number(await Bun.file(readyFile).text());
    expect(isProcessRunning(pid)).toBe(true);
    await Fiber.interrupt(fiber).pipe(Effect.runPromise);
    expect(isProcessRunning(pid)).toBe(false);
  });
});
