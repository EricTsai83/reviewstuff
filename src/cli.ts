import { Command } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import packageJson from "../package.json";
import { doctorCommand } from "./commands/doctor";
import { reviewCommand } from "./commands/review";

const command = Command.make("reviewstuff").pipe(
  Command.withDescription("A code review CLI scaffold."),
  Command.withSubcommands([reviewCommand, doctorCommand]),
);

const cli = Command.run(command, {
  executable: "reviewstuff",
  name: "reviewstuff",
  version: packageJson.version,
});

cli(Bun.argv).pipe(
  Effect.catchAll((error) => {
    if (ValidationError.isValidationError(error)) {
      return Effect.sync(() => {
        process.exitCode = 1;
      });
    }

    return Effect.fail(error);
  }),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain,
);
