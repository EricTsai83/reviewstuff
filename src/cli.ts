import { Command } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import packageJson from "../package.json";

type CliEffect = Effect.Effect<void, Error>;

const reviewProgram = (): CliEffect =>
  Console.log("review command is not implemented yet.");

const doctorProgram = (): CliEffect =>
  Console.log("doctor command is not implemented yet.");

const reviewCommand = Command.make("review", {}, () => reviewProgram()).pipe(
  Command.withDescription("Review code changes."),
);

const doctorCommand = Command.make("doctor", {}, () => doctorProgram()).pipe(
  Command.withDescription("Check local reviewstuff environment."),
);

const command = Command.make("reviewstuff").pipe(
  Command.withDescription("A code review CLI scaffold."),
  Command.withSubcommands([reviewCommand, doctorCommand]),
);

const cli = Command.run(command, {
  executable: "reviewstuff",
  name: "reviewstuff",
  version: packageJson.version,
});

Effect.suspend(() => cli(process.argv)).pipe(
  Effect.catchAll((error) => {
    if (ValidationError.isValidationError(error)) {
      return Effect.sync(() => {
        process.exitCode = 1;
      });
    }

    return Console.error(error.message).pipe(
      Effect.zipRight(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    );
  }),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain,
);
