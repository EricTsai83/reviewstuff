import * as Console from "effect/Console";
import { Command } from "effect/unstable/cli";

export const doctorCommand = Command.make("doctor").pipe(
  Command.withDescription("Check local reviewstuff environment."),
  Command.withHandler(() =>
    Console.log("doctor command is not implemented yet."),
  ),
);
