import { Context, Data, type Duration, type Effect } from "effect";

export interface CommandRequest {
  readonly program: string;
  readonly args?: ReadonlyArray<string>;
  readonly workingDirectory?: string;
  readonly timeout: Duration.DurationInput;
  readonly maxOutputBytes: number;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export class CommandStartError extends Data.TaggedError("CommandStartError")<{
  readonly program: string;
  readonly cause: unknown;
}> {}

export class CommandTimeoutError extends Data.TaggedError(
  "CommandTimeoutError",
)<{
  readonly program: string;
}> {}

export class CommandOutputLimitError extends Data.TaggedError(
  "CommandOutputLimitError",
)<{
  readonly program: string;
  readonly maxOutputBytes: number;
}> {}

export type CommandExecutionError =
  | CommandStartError
  | CommandTimeoutError
  | CommandOutputLimitError;

export interface CommandRunnerService {
  readonly run: (
    request: CommandRequest,
  ) => Effect.Effect<CommandResult, CommandExecutionError>;
}

export class CommandRunner extends Context.Tag("reviewstuff/CommandRunner")<
  CommandRunner,
  CommandRunnerService
>() {}
