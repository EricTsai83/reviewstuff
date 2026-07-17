import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Command } from "effect/unstable/cli";
import packageJson from "../package.json";
import { doctorCommand } from "./commands/doctor";
import { reviewCommand } from "./commands/review";
import * as GitService from "./git/git-service";
import * as CommandRunner from "./platform/command-runner";
import * as FileInspector from "./platform/file-inspector";

const AppLive = GitService.layer.pipe(
  Layer.provide(Layer.merge(CommandRunner.layer, FileInspector.layer)),
  Layer.provideMerge(BunServices.layer),
);

const command = Command.make("reviewstuff").pipe(
  Command.withDescription("A code review CLI scaffold."),
  Command.withSubcommands([reviewCommand, doctorCommand]),
);

Command.run(command, { version: packageJson.version }).pipe(
  Effect.scoped,
  Effect.provide(AppLive),
  BunRuntime.runMain,
);
