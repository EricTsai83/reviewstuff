import * as BunServices from "@effect/platform-bun/BunServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";

export const binaryPath = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join(process.cwd(), "dist", "reviewstuff");
}).pipe(Effect.provide(BunServices.layer), Effect.runSync);
export const sourceCliPath = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join(process.cwd(), "src", "cli.ts");
}).pipe(Effect.provide(BunServices.layer), Effect.runSync);

export interface CliResult {
  exitCode: number | null;
  success: boolean;
  stdout: string;
  stderr: string;
}

export interface ProcessOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const streamToString = (
  stream: Stream.Stream<Uint8Array, unknown>,
): Effect.Effect<string, unknown> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(() => "", (output, chunk) => output + chunk),
  );

export function formatFailure(
  args: ReadonlyArray<string>,
  result: CliResult,
): string {
  return [
    `Command failed: ${binaryPath} ${args.join(" ")}`,
    `exit code: ${result.exitCode ?? "unknown"}`,
    "stdout:",
    result.stdout,
    "stderr:",
    result.stderr,
  ].join("\n");
}

export const runProcess = (
  program: string,
  args: ReadonlyArray<string>,
  options: ProcessOptions = {},
): Promise<CliResult> =>
  Effect.gen(function* () {
    const process = yield* ChildProcess.make(program, args, {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: options.env }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        streamToString(process.stdout),
        streamToString(process.stderr),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );

    return {
      exitCode: Number(exitCode),
      success: exitCode === 0,
      stdout,
      stderr,
    };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer), Effect.runPromise);

export const runCliProcess = (
  args: ReadonlyArray<string>,
  options: ProcessOptions = {},
): Promise<CliResult> => runProcess(binaryPath, args, options);

export const runSourceCliProcess = (
  args: ReadonlyArray<string>,
  options: ProcessOptions = {},
): Promise<CliResult> =>
  runProcess(process.execPath, [sourceCliPath, ...args], options);

export const runCli = (
  args: ReadonlyArray<string>,
  options: ProcessOptions = {},
): Promise<string> =>
  runCliProcess(args, options).then((result) => {
    if (!result.success) {
      throw new Error(formatFailure(args, result));
    }

    return result.stdout;
  });

export const runCliExpectingFailure = (
  args: ReadonlyArray<string>,
  options: ProcessOptions = {},
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

export const makeTemporaryDirectory = (prefix: string): Promise<string> =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.makeTempDirectory({ prefix })),
    Effect.provide(BunServices.layer),
    Effect.runPromise,
  );

export const runGit = async (
  cwd: string,
  args: ReadonlyArray<string>,
): Promise<CliResult> => {
  const result = await runProcess("git", args, { cwd });

  if (!result.success) {
    throw new Error(
      `git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`,
    );
  }

  return result;
};

/**
 * Creates a repository with one committed file and an identity that does not
 * depend on the developer's global Git configuration.
 */
export const makeRepository = async (): Promise<string> => {
  const cwd = await makeTemporaryDirectory("reviewstuff-git-e2e-");

  await runGit(cwd, ["init", "--quiet"]);
  await runGit(cwd, ["config", "user.email", "reviewstuff@example.com"]);
  await runGit(cwd, ["config", "user.name", "Review Stuff"]);
  await Bun.write(`${cwd}/tracked.ts`, "export const initial = true;\n");
  await runGit(cwd, ["add", "tracked.ts"]);
  await runGit(cwd, ["commit", "--quiet", "-m", "initial"]);

  return cwd;
};
