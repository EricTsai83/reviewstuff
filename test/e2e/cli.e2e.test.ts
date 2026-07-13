import { Command, FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect, Stream } from "effect";
import packageJson from "../../package.json";

const binaryPath = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join(process.cwd(), "dist", "reviewstuff");
}).pipe(Effect.provide(BunContext.layer), Effect.runSync);

interface CliResult {
  exitCode: number | null;
  success: boolean;
  stdout: string;
  stderr: string;
}

const streamToString = (
  stream: Stream.Stream<Uint8Array, unknown>,
): Effect.Effect<string, unknown> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold("", (output, chunk) => output + chunk),
  );

function formatFailure(args: ReadonlyArray<string>, result: CliResult): string {
  return [
    `Command failed: ${binaryPath} ${args.join(" ")}`,
    `exit code: ${result.exitCode ?? "unknown"}`,
    "stdout:",
    result.stdout,
    "stderr:",
    result.stderr,
  ].join("\n");
}

const runCliProcess = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<CliResult> =>
  Effect.gen(function* () {
    const baseCommand = Command.make(binaryPath, ...args).pipe(
      Command.stdout("pipe"),
      Command.stderr("pipe"),
    );
    const command =
      options.cwd === undefined
        ? baseCommand
        : baseCommand.pipe(Command.workingDirectory(options.cwd));
    const process = yield* Command.start(command);
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        streamToString(process.stdout),
        streamToString(process.stderr),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );

    return {
      exitCode,
      success: exitCode === 0,
      stdout,
      stderr,
    };
  }).pipe(Effect.scoped, Effect.provide(BunContext.layer), Effect.runPromise);

const runCli = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<string> =>
  runCliProcess(args, options).then((result) => {
    if (!result.success) {
      throw new Error(formatFailure(args, result));
    }

    return result.stdout;
  });

const runCliExpectingFailure = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<CliResult> =>
  runCliProcess(args, options).then((result) => {
    if (result.success) {
      throw new Error(
        [
          `Command unexpectedly succeeded: ${binaryPath} ${args.join(" ")}`,
          "exit code: 0",
          "stdout:",
          result.stdout,
          "stderr:",
          result.stderr,
        ].join("\n"),
      );
    }

    return result;
  });

describe("reviewstuff binary", () => {
  test("--version prints the package version", async () => {
    expect((await runCli(["--version"])).trim()).toBe(packageJson.version);
  });

  test("--help prints command documentation", async () => {
    const stdout = await runCli(["--help"]);

    expect(stdout).toContain(`reviewstuff ${packageJson.version}`);
    expect(stdout).toContain("COMMANDS");
    expect(stdout).toContain("review");
    expect(stdout).toContain("doctor");
  });

  test("unknown command exits with a validation error", async () => {
    const result = await runCliExpectingFailure(["unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Invalid subcommand for reviewstuff - use one of 'review', 'doctor'",
    );
    expect(result.stdout).toBe("");
  });

  test("review command can run outside a git repository", async () => {
    const cwd = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeTempDirectory({ prefix: "reviewstuff-e2e-" }),
      ),
      Effect.provide(BunContext.layer),
      Effect.runPromise,
    );

    expect((await runCli(["review"], { cwd })).trim()).toBe(
      "review command is not implemented yet.",
    );
  });
});
