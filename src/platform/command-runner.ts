import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

export interface CommandRequest {
  readonly program: string;
  readonly args?: ReadonlyArray<string>;
  readonly workingDirectory?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly timeout: Duration.Input;
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
  readonly timeoutMilliseconds: number;
}> {}

export class CommandOutputLimitError extends Data.TaggedError(
  "CommandOutputLimitError",
)<{
  readonly program: string;
  readonly maxOutputBytes: number;
  readonly observedOutputBytes: number;
}> {}

export type CommandProcessPhase = "stdout" | "stderr" | "exit-code";

export class CommandProcessError extends Data.TaggedError(
  "CommandProcessError",
)<{
  readonly program: string;
  readonly phase: CommandProcessPhase;
  readonly cause: unknown;
}> {}

export class CommandTerminationError extends Data.TaggedError(
  "CommandTerminationError",
)<{
  readonly program: string;
  readonly cause: unknown;
}> {}

export type CommandExecutionError =
  | CommandStartError
  | CommandTimeoutError
  | CommandOutputLimitError
  | CommandProcessError
  | CommandTerminationError;

export class CommandRunner extends Context.Service<
  CommandRunner,
  {
    readonly run: (
      request: CommandRequest,
    ) => Effect.Effect<CommandResult, CommandExecutionError>;
  }
>()("reviewstuff/CommandRunner") {}

export type Service = CommandRunner["Service"];

const terminate = (
  process: ChildProcessSpawner.ChildProcessHandle,
  program: string,
): Effect.Effect<void, CommandTerminationError> =>
  process.isRunning.pipe(
    Effect.flatMap((isRunning) =>
      isRunning ? process.kill({ killSignal: "SIGKILL" }) : Effect.void,
    ),
    Effect.mapError(
      (cause) => new CommandTerminationError({ program, cause }),
    ),
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
                  observedOutputBytes: count,
                }),
              )
            : Effect.void,
        ),
      ),
    ),
    Stream.decodeText(),
    Stream.runFold(() => "", (output, chunk) => output + chunk),
  );

const runCommand = (
  request: CommandRequest,
): Effect.Effect<
  CommandResult,
  CommandExecutionError,
  ChildProcessSpawner.ChildProcessSpawner
> => {
  const command = ChildProcess.make(
    request.program,
    request.args ?? [],
    {
      ...(request.workingDirectory === undefined
        ? {}
        : { cwd: request.workingDirectory }),
      ...(request.environment === undefined
        ? {}
        : { env: request.environment, extendEnv: true }),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  return Effect.gen(function* () {
    const processRef = yield* Ref.make<
      ChildProcessSpawner.ChildProcessHandle | undefined
    >(undefined);

    return yield* Effect.gen(function* () {
      const process = yield* command.pipe(
        Effect.mapError(
          (cause) =>
            new CommandStartError({ program: request.program, cause }),
        ),
      );
      yield* Ref.set(processRef, process);
      const byteCount = yield* Ref.make(0);

      const [stdout, stderr, exitCode] = yield* Effect.all(
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
      );

      return { stdout, stderr, exitCode };
    }).pipe(
      Effect.timeoutOrElse({
        duration: request.timeout,
        orElse: () =>
          Effect.fail(
            new CommandTimeoutError({
              program: request.program,
              timeoutMilliseconds: Duration.toMillis(request.timeout),
            }),
          ),
      }),
      Effect.onExit(() =>
        Ref.get(processRef).pipe(
          Effect.flatMap((process) =>
            process === undefined
              ? Effect.void
              : terminate(process, request.program)
          ),
        )
      ),
      Effect.scoped,
    );
  });
};

export const layer: Layer.Layer<
  CommandRunner,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> = Layer.effect(
  CommandRunner,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    return {
      run: (request) =>
        runCommand(request).pipe(
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            spawner,
          ),
        ),
    };
  }),
);
