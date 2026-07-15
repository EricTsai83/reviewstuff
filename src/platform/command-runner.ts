import * as PlatformCommand from "@effect/platform/Command";
import * as CommandExecutor from "@effect/platform/CommandExecutor";
import {
  Context,
  Data,
  type Duration,
  Effect,
  Layer,
  Ref,
  Stream,
} from "effect";

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

export type CommandProcessPhase = "stdout" | "stderr" | "exit-code";

export class CommandProcessError extends Data.TaggedError(
  "CommandProcessError",
)<{
  readonly program: string;
  readonly phase: CommandProcessPhase;
  readonly cause: unknown;
}> {}

export type CommandExecutionError =
  | CommandStartError
  | CommandTimeoutError
  | CommandOutputLimitError
  | CommandProcessError;

export class CommandRunner extends Context.Tag("reviewstuff/CommandRunner")<
  CommandRunner,
  {
    readonly run: (
      request: CommandRequest,
    ) => Effect.Effect<CommandResult, CommandExecutionError>;
  }
>() {}

export type Service = Context.Tag.Service<typeof CommandRunner>;

const terminate = (process: CommandExecutor.Process): Effect.Effect<void> =>
  process.isRunning.pipe(
    Effect.flatMap((isRunning) =>
      isRunning ? process.kill("SIGKILL") : Effect.void,
    ),
    Effect.catchAll(() => Effect.void),
  );

const readOutput = (
  stream: Stream.Stream<Uint8Array, unknown>,
  request: CommandRequest,
  byteCount: Ref.Ref<number>,
  phase: Extract<CommandProcessPhase, "stdout" | "stderr">,
): Effect.Effect<string, CommandProcessError | CommandOutputLimitError> =>
  stream.pipe(
    Stream.mapError(
      (cause) =>
        new CommandProcessError({
          program: request.program,
          phase,
          cause,
        }),
    ),
    Stream.tap((chunk) =>
      Ref.updateAndGet(byteCount, (count) => count + chunk.byteLength).pipe(
        Effect.flatMap((count) =>
          count > request.maxOutputBytes
            ? Effect.fail(
                new CommandOutputLimitError({
                  program: request.program,
                  maxOutputBytes: request.maxOutputBytes,
                }),
              )
            : Effect.void,
        ),
      ),
    ),
    Stream.decodeText(),
    Stream.runFold("", (output, chunk) => output + chunk),
  );

const runCommand = (
  request: CommandRequest,
): Effect.Effect<
  CommandResult,
  CommandExecutionError,
  CommandExecutor.CommandExecutor
> => {
  const baseCommand = PlatformCommand.make(
    request.program,
    ...(request.args ?? []),
  ).pipe(PlatformCommand.stdout("pipe"), PlatformCommand.stderr("pipe"));
  const command =
    request.workingDirectory === undefined
      ? baseCommand
      : baseCommand.pipe(
          PlatformCommand.workingDirectory(request.workingDirectory),
        );

  return Effect.gen(function* () {
    const process = yield* PlatformCommand.start(command).pipe(
      Effect.mapError(
        (cause) =>
          new CommandStartError({ program: request.program, cause }),
      ),
    );
    const byteCount = yield* Ref.make(0);

    const execution = Effect.all(
      [
        readOutput(process.stdout, request, byteCount, "stdout"),
        readOutput(process.stderr, request, byteCount, "stderr"),
        process.exitCode.pipe(
          Effect.mapError((cause) =>
            new CommandProcessError({
              program: request.program,
              phase: "exit-code",
              cause,
            })
          ),
        ),
      ],
      { concurrency: "unbounded" },
    ).pipe(Effect.ensuring(terminate(process)));
    const [stdout, stderr, exitCode] = yield* execution;

    return { stdout, stderr, exitCode };
  }).pipe(
    Effect.scoped,
    Effect.timeoutFail({
      duration: request.timeout,
      onTimeout: () => new CommandTimeoutError({ program: request.program }),
    }),
  );
};

export const layer: Layer.Layer<
  CommandRunner,
  never,
  CommandExecutor.CommandExecutor
> = Layer.effect(
  CommandRunner,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    return {
      run: (request) =>
        runCommand(request).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor),
        ),
    };
  }),
);
