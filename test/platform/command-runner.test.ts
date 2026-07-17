import * as BunServices from "@effect/platform-bun/BunServices";
import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CommandRequest,
  CommandOutputLimitError,
  CommandProcessError,
  CommandRunner,
  CommandStartError,
  CommandTerminationError,
  CommandTimeoutError,
  layer,
} from "../../src/platform/command-runner";

const live = layer.pipe(Layer.provide(BunServices.layer));

const makeProcess = (
  stdout: ChildProcessSpawner.ChildProcessHandle["stdout"],
  exitCode: ChildProcessSpawner.ChildProcessHandle["exitCode"],
  options: {
    readonly isRunning?: ChildProcessSpawner.ChildProcessHandle["isRunning"];
    readonly kill?: ChildProcessSpawner.ChildProcessHandle["kill"];
  } = {},
): ChildProcessSpawner.ChildProcessHandle =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode,
    isRunning: options.isRunning ?? Effect.succeed(false),
    kill: options.kill ?? (() => Effect.void),
    stdin: Sink.drain,
    stdout,
    stderr: Stream.empty,
    all: stdout,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });

const platformError = (method: string) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "Command",
    method,
  });

const runWithProcess = (
  process: ChildProcessSpawner.ChildProcessHandle,
  timeout: CommandRequest["timeout"] = "1 second",
) => {
  const spawner = ChildProcessSpawner.make(() => Effect.succeed(process));
  const testLayer = layer.pipe(
    Layer.provide(
      Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
    ),
  );

  return CommandRunner.pipe(
    Effect.flatMap((runner) =>
      runner.run({
        program: "fake-command",
        timeout,
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

  test("extends the inherited environment with request overrides", async () => {
    const result = await CommandRunner.pipe(
      Effect.flatMap((runner) =>
        runner.run({
          program: process.execPath,
          args: [
            "-e",
            'process.stdout.write(JSON.stringify({ locale: process.env.LC_ALL, path: process.env.PATH }));',
          ],
          environment: { LC_ALL: "C" },
          timeout: "5 seconds",
          maxOutputBytes: 16 * 1024,
        }),
      ),
      Effect.provide(live),
      Effect.runPromise,
    );

    expect(JSON.parse(result.stdout)).toEqual({
      locale: "C",
      path: process.env.PATH,
    });
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
    if (!(error instanceof CommandOutputLimitError)) {
      throw new Error("Expected CommandOutputLimitError");
    }

    expect(error.maxOutputBytes).toBe(1_000);
    expect(error.observedOutputBytes).toBeGreaterThan(1_000);
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
      makeProcess(
        Stream.fail(cause),
        Effect.succeed(ChildProcessSpawner.ExitCode(0)),
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
      makeProcess(Stream.empty, Effect.fail(cause)),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(CommandProcessError);
    if (!(error instanceof CommandProcessError)) {
      throw new Error("Expected CommandProcessError");
    }

    expect(error.phase).toBe("exit-code");
    expect(error.cause).toBe(cause);
  });

  test("maps process termination failures", async () => {
    const cause = platformError("kill");
    const error = await runWithProcess(
      makeProcess(
        Stream.empty,
        Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        {
          isRunning: Effect.succeed(true),
          kill: () => Effect.fail(cause),
        },
      ),
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(CommandTerminationError);
    if (!(error instanceof CommandTerminationError)) {
      throw new Error("Expected CommandTerminationError");
    }

    expect(error.cause).toBe(cause);
  });

  test("preserves termination failures when a timeout triggers cleanup", async () => {
    const cause = platformError("kill");
    const error = await runWithProcess(
      makeProcess(
        Stream.never,
        Effect.never,
        {
          isRunning: Effect.succeed(true),
          kill: () => Effect.fail(cause),
        },
      ),
      "10 millis",
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(CommandTerminationError);
    if (!(error instanceof CommandTerminationError)) {
      throw new Error("Expected CommandTerminationError");
    }

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
    if (!(error instanceof CommandTimeoutError)) {
      throw new Error("Expected CommandTimeoutError");
    }

    expect(error.timeoutMilliseconds).toBe(200);
    const pid = Number(await Bun.file(readyFile).text());
    expect(isProcessRunning(pid)).toBe(false);
  });

  test("output-limit failure terminates the child process", async () => {
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
            'const ready = Bun.argv.at(-1); await Bun.write(ready, String(process.pid)); process.on("SIGTERM", () => {}); process.stdout.write("x".repeat(2000)); setInterval(() => {}, 1000);',
            readyFile,
          ],
          timeout: "5 seconds",
          maxOutputBytes: 1_000,
        }),
      ),
      Effect.provide(live),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(CommandOutputLimitError);
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
