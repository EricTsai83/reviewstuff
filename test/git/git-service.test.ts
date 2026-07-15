import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  GitCommandError,
  GitExecutionError,
  GitNotRepositoryError,
  GitService,
  layer,
} from "../../src/git/git-service";
import {
  CommandRunner,
  CommandStartError,
  type CommandResult,
  type Service,
} from "../../src/platform/command-runner";
import { FileInspector } from "../../src/platform/file-inspector";

const provideGit = (runner: Service) =>
  layer.pipe(
    Layer.provide(
      Layer.merge(
        Layer.succeed(CommandRunner, runner),
        Layer.succeed(FileInspector, {
          size: () => Effect.succeed(0n),
        }),
      ),
    ),
  );

const result = (
  stdout: string,
  exitCode = 0,
  stderr = "",
): CommandResult => ({ stdout, stderr, exitCode });

describe("GitService error mapping", () => {
  test("maps repository detection failure to GitNotRepositoryError", async () => {
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({ run: () => Effect.succeed(result("", 128, "fatal")) }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitNotRepositoryError);
  });

  test("maps runner errors to GitExecutionError", async () => {
    const runnerError = new CommandStartError({
      program: "git",
      cause: new Error("spawn failed"),
    });
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({ run: () => Effect.fail(runnerError) }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitExecutionError);
    expect(error.cause).toBe(runnerError);
  });

  test("maps command exit codes to GitCommandError", async () => {
    let call = 0;
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("staged")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;
            return Effect.succeed(
              call === 1 ? result("true\n") : result("", 2, "bad index"),
            );
          },
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitCommandError);
    if (!(error instanceof GitCommandError)) {
      throw new Error("Expected GitCommandError");
    }

    expect(error.exitCode).toBe(2);
    expect(error.stderrLength).toBe("bad index".length);
  });
});
