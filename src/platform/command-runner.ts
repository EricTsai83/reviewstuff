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

const terminateChildProcess = (
  childProcess: ChildProcessSpawner.ChildProcessHandle,
  program: string,
): Effect.Effect<void, CommandTerminationError> =>
  childProcess.isRunning.pipe(
    Effect.flatMap((isRunning) =>
      isRunning ? childProcess.kill({ killSignal: "SIGKILL" }) : Effect.void,
    ),
    Effect.mapError(
      (cause) => new CommandTerminationError({ program, cause }),
    ),
  );

const collectOutputStream = (
  stream: Stream.Stream<Uint8Array, unknown>,
  request: CommandRequest,
  combinedOutputBytes: Ref.Ref<number>,
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
      // Both pipes share one budget so a command cannot bypass the limit by
      // splitting output between stdout and stderr.
      Ref.updateAndGet(
        combinedOutputBytes,
        (count) => count + chunk.byteLength,
      ).pipe(
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
    // Cleanup runs outside the timeout region, so the handle must remain
    // reachable even when startup or stream collection is interrupted.
    const childProcessRef = yield* Ref.make<
      ChildProcessSpawner.ChildProcessHandle | undefined
    >(undefined);

    return yield* Effect.gen(function* () {
      const childProcess = yield* command.pipe(
        Effect.mapError(
          (cause) =>
            new CommandStartError({ program: request.program, cause }),
        ),
      );
      yield* Ref.set(childProcessRef, childProcess);
      const combinedOutputBytes = yield* Ref.make(0);

      // Drain both pipes while waiting for exit. Sequential draining can let
      // one full OS pipe block the child process and deadlock the command.
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          collectOutputStream(
            childProcess.stdout,
            request,
            combinedOutputBytes,
            "stdout",
          ),
          collectOutputStream(
            childProcess.stderr,
            request,
            combinedOutputBytes,
            "stderr",
          ),
          childProcess.exitCode.pipe(
            Effect.mapError((cause) =>
              new CommandProcessError({
                program: request.program,
                phase: "exit-code",
                cause,
              })
            ),
          ),
        ],
        { concurrency: 3 },
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
        Ref.get(childProcessRef).pipe(
          Effect.flatMap((childProcess) =>
            childProcess === undefined
              ? Effect.void
              : terminateChildProcess(childProcess, request.program)
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
