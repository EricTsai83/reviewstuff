import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { runReview } from "../use-cases/run-review";

export const reviewCommand = Command.make("review", {}, () =>
  runReview.pipe(
    Effect.zipRight(Console.log("review command is not implemented yet.")),
  ),
).pipe(Command.withDescription("Review code changes."));
