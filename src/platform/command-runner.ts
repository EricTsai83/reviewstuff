import { Context, type Duration, type Effect } from "effect";

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

export interface CommandStartError {
  readonly _tag: "CommandStartError";
  readonly program: string;
  readonly cause: unknown;
}

export interface CommandTimeoutError {
  readonly _tag: "CommandTimeoutError";
  readonly program: string;
}

export interface CommandOutputLimitError {
  readonly _tag: "CommandOutputLimitError";
  readonly program: string;
  readonly maxOutputBytes: number;
}

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
