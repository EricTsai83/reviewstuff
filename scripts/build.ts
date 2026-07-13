import * as Command from "@effect/platform/Command";
import { FileSystem } from "@effect/platform/FileSystem";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Data, Effect } from "effect";

const executablePath = "dist/reviewstuff";

class CommandFailedError extends Data.TaggedError("CommandFailedError")<{
  readonly message: string;
}> {}

const makeBuildCommand = (command: string, args: ReadonlyArray<string>) =>
  Command.make(command, ...args).pipe(
    Command.env(process.env),
    Command.stdout("inherit"),
    Command.stderr("inherit"),
  );

const formatCommand = (command: string, args: ReadonlyArray<string>) =>
  [command, ...args].map((part) => JSON.stringify(part)).join(" ");

const run = (command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const exitCode = yield* Command.exitCode(makeBuildCommand(command, args));

    if (exitCode !== 0) {
      return yield* new CommandFailedError({
        message: `Command failed with exit code ${exitCode}: ${formatCommand(command, args)}`,
      });
    }
  });

const program = Effect.gen(function* () {
  const fs = yield* FileSystem;

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
  Effect.catchAll((error) =>
    Console.error(error instanceof Error ? error.message : String(error)).pipe(
      Effect.zipRight(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain,
);
