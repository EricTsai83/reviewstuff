import { Effect } from "effect";
import {
  installLocalEffect,
  LocalBinError,
  runLocalBinMain,
} from "./local-bin";

interface ParsedArgs {
  readonly force: boolean;
}

const parseArgs = (
  args: ReadonlyArray<string>,
): Effect.Effect<ParsedArgs, LocalBinError> => {
  const unknownArgs = args.filter((arg) => arg !== "--force");

  return unknownArgs.length > 0
    ? Effect.fail(
        new LocalBinError({
          message: `Unknown argument: ${unknownArgs.join(" ")}. Supported: --force`,
        }),
      )
    : Effect.succeed({ force: args.includes("--force") });
};

runLocalBinMain(
  Effect.gen(function* () {
    const { force } = yield* parseArgs(Bun.argv.slice(2));

    yield* installLocalEffect({ replaceExisting: force });
  }),
);
