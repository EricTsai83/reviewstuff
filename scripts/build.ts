import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/unstable/process/ChildProcess";

const executablePath = "dist/reviewstuff";

class CommandFailedError extends Data.TaggedError("CommandFailedError")<{
  readonly message: string;
}> {}

const makeBuildCommand = (command: string, args: ReadonlyArray<string>) =>
  ChildProcess.make(command, args, {
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });

const formatCommand = (command: string, args: ReadonlyArray<string>) =>
  [command, ...args].map((part) => JSON.stringify(part)).join(" ");

const run = (command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const process = yield* makeBuildCommand(command, args);
    const exitCode = yield* process.exitCode;

    if (exitCode !== 0) {
      return yield* new CommandFailedError({
        message: `Command failed with exit code ${exitCode}: ${formatCommand(command, args)}`,
      });
    }
  });

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;

  yield* fs.makeDirectory("dist", { recursive: true });

  yield* run("bun", [
    "build",
    "src/cli.ts",
    "--compile",
    "--target=bun-darwin-arm64",
    `--outfile=${executablePath}`,
  ]);

  yield* run(`./${executablePath}`, ["--version"]);
  yield* run(`./${executablePath}`, ["--help"]);
});

program.pipe(
  Effect.scoped,
  Effect.catch((error) =>
    Console.error(error.message).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
