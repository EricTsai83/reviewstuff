import { Command } from "@effect/cli";
import { Console } from "effect";

export const doctorCommand = Command.make("doctor", {}, () =>
  Console.log("doctor command is not implemented yet."),
).pipe(Command.withDescription("Check local reviewstuff environment."));
