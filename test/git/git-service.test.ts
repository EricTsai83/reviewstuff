import * as BunServices from "@effect/platform-bun/BunServices";
import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import {
  GitCommandError,
  GitCommandOutputLimitError,
  GitCommandProcessError,
  GitCommandTimeoutError,
  GitChangedFileUnavailableError,
  GitExecutionError,
  GitInvalidOutputError,
  GitNotRepositoryError,
  GitService,
  GitUnmergedPathsError,
  GitWorkingTreeUnavailableError,
  layer,
} from "../../src/git/git-service";
import {
  CommandOutputLimitError,
  CommandProcessError,
  CommandRunner,
  CommandStartError,
  CommandTimeoutError,
  type CommandRequest,
  type CommandResult,
  type Service,
  layer as commandRunnerLayer,
} from "../../src/platform/command-runner";
import {
  FileInspector,
} from "../../src/platform/file-inspector";

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

const commandRunnerLive = commandRunnerLayer.pipe(
  Layer.provide(BunServices.layer),
);
const cliSourcePath = `${process.cwd()}/src/cli.ts`;

const runGit = (
  workingDirectory: string,
  args: ReadonlyArray<string>,
  expectedExitCodes: ReadonlySet<number> = new Set([0]),
): Effect.Effect<void, unknown> =>
  CommandRunner.pipe(
    Effect.flatMap((runner) =>
      runner.run({
        program: "git",
        args,
        workingDirectory,
        timeout: 10_000,
        maxOutputBytes: 4 * 1024 * 1024,
      }),
    ),
    Effect.flatMap((commandResult) =>
      expectedExitCodes.has(commandResult.exitCode)
        ? Effect.void
        : Effect.fail(
            new Error(`Git fixture setup failed with ${commandResult.exitCode}`),
          ),
    ),
    Effect.provide(commandRunnerLive),
  );

describe("GitService error mapping", () => {
  test("fails before reading patches when unmerged paths exist", async () => {
    let call = 0;
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;

            switch (call) {
              case 1:
                return Effect.succeed(result("true\n"));
              case 2:
                return Effect.succeed(result("/repo\n"));
              case 3:
                return Effect.succeed(result("U\0z.ts\0"));
              case 4:
                return Effect.succeed(result("U\0b.ts\0U\0z.ts\0"));
              default:
                throw new Error("GitService read past unmerged-path detection");
            }
          },
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitUnmergedPathsError);
    if (!(error instanceof GitUnmergedPathsError)) {
      throw new Error("Expected GitUnmergedPathsError");
    }

    expect(error.paths).toEqual(["b.ts", "z.ts"]);
    expect(call).toBe(4);
  });

  test("forces a stable English locale for Git commands", async () => {
    const requests: Array<CommandRequest> = [];

    await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({
          run: (request) => {
            requests.push(request);
            return Effect.succeed(
              result("", 128, "fatal: not a git repository"),
            );
          },
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(requests[0]?.environment).toEqual({ LC_ALL: "C" });
  });

  test("maps repository detection failure to GitNotRepositoryError", async () => {
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({
          run: () =>
            Effect.succeed(
              result("", 128, "fatal: not a git repository"),
            ),
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitNotRepositoryError);
  });

  test("distinguishes a repository without a working tree", async () => {
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({ run: () => Effect.succeed(result("false\n")) }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitWorkingTreeUnavailableError);
  });

  test("preserves unexpected repository detection failures", async () => {
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({
          run: () =>
            Effect.succeed(
              result(
                "",
                128,
                "fatal: detected dubious ownership; configure safe.directory",
              ),
            ),
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitCommandError);
    if (!(error instanceof GitCommandError)) {
      throw new Error("Expected GitCommandError");
    }

    expect(error.operation).toBe("detect git repository");
    expect(error.failure).toBe("unsafe-repository");
  });

  test("rejects malformed repository detection output using UTF-8 bytes", async () => {
    const stdout = "錯誤\n";
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({ run: () => Effect.succeed(result(stdout)) }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    if (!(error instanceof GitInvalidOutputError)) {
      throw new Error("Expected GitInvalidOutputError");
    }

    expect(error.operation).toBe("detect git repository");
    expect(error.outputBytes).toBe(Buffer.byteLength(stdout));
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
    if (!(error instanceof GitExecutionError)) {
      throw new Error("Expected GitExecutionError");
    }

    expect(error.cause).toBe(runnerError);
    expect(error.failure).toBe("command-start");
  });

  test("preserves the failed process phase", async () => {
    const runnerError = new CommandProcessError({
      program: "git",
      phase: "stderr",
      cause: new Error("stream failed"),
    });
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({ run: () => Effect.fail(runnerError) }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitCommandProcessError);
    if (!(error instanceof GitCommandProcessError)) {
      throw new Error("Expected GitCommandProcessError");
    }

    expect(error.operation).toBe("detect git repository");
    expect(error.phase).toBe("stderr");
    expect(error.cause).toBe(runnerError);
  });

  test("preserves timeout details as a GitCommandTimeoutError", async () => {
    const runnerError = new CommandTimeoutError({
      program: "git",
      timeoutMilliseconds: 10_000,
    });
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({ run: () => Effect.fail(runnerError) }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitCommandTimeoutError);
    if (!(error instanceof GitCommandTimeoutError)) {
      throw new Error("Expected GitCommandTimeoutError");
    }

    expect(error.operation).toBe("detect git repository");
    expect(error.timeoutMilliseconds).toBe(10_000);
    expect(error.cause).toBe(runnerError);
  });

  test("preserves output limits as a fatal GitCommandOutputLimitError", async () => {
    const runnerError = new CommandOutputLimitError({
      program: "git",
      maxOutputBytes: 4 * 1024 * 1024,
      observedOutputBytes: 4 * 1024 * 1024 + 1,
    });
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({ run: () => Effect.fail(runnerError) }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitCommandOutputLimitError);
    if (!(error instanceof GitCommandOutputLimitError)) {
      throw new Error("Expected GitCommandOutputLimitError");
    }

    expect(error.operation).toBe("detect git repository");
    expect(error.maxOutputBytes).toBe(4 * 1024 * 1024);
    expect(error.observedOutputBytes).toBe(4 * 1024 * 1024 + 1);
    expect(error.cause).toBe(runnerError);
  });

  test("does not downgrade a patch output limit to skipped coverage", async () => {
    let call = 0;
    const runnerError = new CommandOutputLimitError({
      program: "git",
      maxOutputBytes: 512 * 1024,
      observedOutputBytes: 512 * 1024 + 1,
    });
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("staged")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;

            switch (call) {
              case 1:
                return Effect.succeed(result("true\n"));
              case 2:
                return Effect.succeed(result("/repo\n"));
              case 3:
                return Effect.succeed(result("A\0large.ts\0"));
              case 4:
                return Effect.succeed(result("a".repeat(40)));
              case 5:
                return Effect.succeed(result("100\n"));
              default:
                return Effect.fail(runnerError);
            }
          },
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitCommandOutputLimitError);
    if (!(error instanceof GitCommandOutputLimitError)) {
      throw new Error("Expected GitCommandOutputLimitError");
    }

    expect(error.operation).toBe("read staged diff");
    expect(error.maxOutputBytes).toBe(512 * 1024);
  });

  test("does not treat fatal object resolution as a missing object", async () => {
    let call = 0;
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("staged")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;

            switch (call) {
              case 1:
                return Effect.succeed(result("true\n"));
              case 2:
                return Effect.succeed(result("/repo\n"));
              case 3:
                return Effect.succeed(result("A\0file.ts\0"));
              default:
                return Effect.succeed(
                  result("", 128, "fatal: permission denied"),
                );
            }
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

    expect(error.operation).toBe("resolve git object");
    expect(error.exitCode).toBe(128);
    expect(error.failure).toBe("permission-denied");
  });

  test("fails when a listed tracked file no longer has a patch", async () => {
    let call = 0;
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("staged")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;

            switch (call) {
              case 1:
                return Effect.succeed(result("true\n"));
              case 2:
                return Effect.succeed(result("/repo\n"));
              case 3:
                return Effect.succeed(result("A\0file.ts\0"));
              case 4:
                return Effect.succeed(result("a".repeat(40)));
              case 5:
                return Effect.succeed(result("100\n"));
              default:
                return Effect.succeed(result(""));
            }
          },
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitChangedFileUnavailableError);
    if (!(error instanceof GitChangedFileUnavailableError)) {
      throw new Error("Expected GitChangedFileUnavailableError");
    }

    expect(error.path).toBe("file.ts");
    expect(error.source).toBe("staged");
  });

  test("fails when review-base resolution has an unexpected exit code", async () => {
    let call = 0;
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;

            switch (call) {
              case 1:
                return Effect.succeed(result("true\n"));
              case 2:
                return Effect.succeed(result("/repo\n"));
              case 3:
              case 4:
              case 5:
                return Effect.succeed(result(""));
              default:
                return Effect.succeed(result("", 2, "corrupt ref"));
            }
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

    expect(error.operation).toBe("resolve review base");
    expect(error.exitCode).toBe(2);
    expect(error.failure).toBe("repository-corrupt");
  });

  test("asks Git for the repository-format empty tree when HEAD is missing", async () => {
    const emptyTreeSha256 =
      "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321";
    const calls: Array<ReadonlyArray<string>> = [];
    let call = 0;
    const diff = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({
          run: (request) => {
            calls.push(request.args ?? []);
            call += 1;

            switch (call) {
              case 1:
                return Effect.succeed(result("true\n"));
              case 2:
                return Effect.succeed(result("/repo\n"));
              case 3:
                return Effect.succeed(result("A\0file.ts\0"));
              case 4:
              case 5:
                return Effect.succeed(result(""));
              case 6:
                return Effect.succeed(result("", 1));
              case 7:
                return Effect.succeed(result(`${emptyTreeSha256}\n`));
              default:
                return Effect.succeed(result("diff --git a/file.ts b/file.ts\n"));
            }
          },
        }),
      ),
      Effect.runPromise,
    );

    expect(calls[6]).toEqual([
      "--literal-pathspecs",
      "hash-object",
      "-t",
      "tree",
      "/dev/null",
    ]);
    expect(calls[7]).toContain(emptyTreeSha256);
    expect(diff.files).toHaveLength(1);
  });

  test("rejects an invalid empty-tree object ID from Git", async () => {
    let call = 0;
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("working-tree")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;

            switch (call) {
              case 1:
                return Effect.succeed(result("true\n"));
              case 2:
                return Effect.succeed(result("/repo\n"));
              case 3:
              case 4:
              case 5:
                return Effect.succeed(result(""));
              case 6:
                return Effect.succeed(result("", 1));
              default:
                return Effect.succeed(result("not-an-object-id\n"));
            }
          },
        }),
      ),
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    if (!(error instanceof GitInvalidOutputError)) {
      throw new Error("Expected GitInvalidOutputError");
    }

    expect(error.operation).toBe("resolve empty tree");
    expect(error.outputBytes).toBe(Buffer.byteLength("not-an-object-id\n"));
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
    expect(error.failure).toBe("unknown");
  });

  test("classifies actionable Git command failures without retaining stderr", async () => {
    let call = 0;
    const stderr = "fatal: Unable to create '.git/index.lock': File exists.";
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("staged")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;
            return Effect.succeed(
              call === 1 ? result("true\n") : result("", 2, stderr),
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

    expect(error.stderrLength).toBe(stderr.length);
    expect(error.failure).toBe("index-locked");
    expect(error).not.toHaveProperty("stderr");
  });

  test("prioritizes permission failures over index lock wording", async () => {
    let call = 0;
    const stderr =
      "fatal: Unable to create '.git/index.lock': Permission denied";
    const error = await GitService.pipe(
      Effect.flatMap((git) => git.readDiff("staged")),
      Effect.provide(
        provideGit({
          run: () => {
            call += 1;
            return Effect.succeed(
              call === 1 ? result("true\n") : result("", 128, stderr),
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

    expect(error.failure).toBe("permission-denied");
  });
});

describe("GitService coverage", () => {
  test("blocks staged review when the repository has merge conflicts", async () => {
    const repository = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fileSystem) =>
        fileSystem.makeTempDirectory({ prefix: "reviewstuff-git-conflict-" }),
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );

    await runGit(repository, ["init", "--quiet"]).pipe(Effect.runPromise);
    await runGit(repository, ["config", "user.email", "test@example.com"])
      .pipe(Effect.runPromise);
    await runGit(repository, ["config", "user.name", "Test"])
      .pipe(Effect.runPromise);
    await Bun.write(`${repository}/conflict.ts`, "export const side = 'base';\n");
    await runGit(repository, ["add", "conflict.ts"]).pipe(Effect.runPromise);
    await runGit(repository, ["commit", "--quiet", "-m", "base"])
      .pipe(Effect.runPromise);
    await runGit(repository, ["checkout", "--quiet", "-b", "side"])
      .pipe(Effect.runPromise);
    await Bun.write(`${repository}/conflict.ts`, "export const side = 'branch';\n");
    await runGit(repository, ["commit", "--quiet", "-am", "side"])
      .pipe(Effect.runPromise);
    await runGit(repository, ["checkout", "--quiet", "-"])
      .pipe(Effect.runPromise);
    await Bun.write(`${repository}/conflict.ts`, "export const side = 'main';\n");
    await runGit(repository, ["commit", "--quiet", "-am", "main"])
      .pipe(Effect.runPromise);
    await runGit(repository, ["merge", "side"], new Set([1])).pipe(
      Effect.runPromise,
    );

    const cliResult = await CommandRunner.pipe(
      Effect.flatMap((runner) =>
        runner.run({
          program: process.execPath,
          args: [cliSourcePath, "review", "--staged"],
          workingDirectory: repository,
          timeout: 10_000,
          maxOutputBytes: 4 * 1024 * 1024,
        }),
      ),
      Effect.provide(commandRunnerLive),
      Effect.runPromise,
    );

    expect(cliResult.exitCode).toBe(1);
    expect(cliResult.stdout).toBe("");
    expect(cliResult.stderr).toContain(
      "Review cannot start because unresolved merge conflicts exist:",
    );
    expect(cliResult.stderr).toContain("- conflict.ts");
    expect(cliResult.stderr).toContain(
      "Resolve and stage these files, or abort the merge/rebase, then run review again.",
    );
    expect(cliResult.stderr).not.toContain("Reviewed");
  });

  test("supports an initial repository and reports binary and large files", async () => {
    const repository = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fileSystem) =>
        fileSystem.makeTempDirectory({ prefix: "reviewstuff-git-service-" }),
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );

    await runGit(repository, ["init", "--quiet"]).pipe(Effect.runPromise);
    await Bun.write(
      `${repository}/included.ts`,
      "export const included = true;\n",
    );
    await Bun.write(
      `${repository}/binary.dat`,
      new Uint8Array([0, 1, 2, 3]),
    );
    await Bun.write(
      `${repository}/large.txt`,
      `large\n${"x".repeat(600 * 1024)}`,
    );
    await runGit(repository, ["add", "--", "included.ts"]).pipe(
      Effect.runPromise,
    );

    const cliResult = await CommandRunner.pipe(
      Effect.flatMap((runner) =>
        runner.run({
          program: process.execPath,
          args: [cliSourcePath, "review", "--json"],
          workingDirectory: repository,
          timeout: 10_000,
          maxOutputBytes: 4 * 1024 * 1024,
        }),
      ),
      Effect.provide(commandRunnerLive),
      Effect.runPromise,
    );
    const report = JSON.parse(cliResult.stdout) as {
      readonly summary: {
        readonly changedFiles: number;
        readonly reviewedFiles: number;
        readonly skippedFiles: number;
        readonly findings: number;
      };
      readonly coverage: {
        readonly complete: boolean;
        readonly files: ReadonlyArray<{
          readonly path: string;
          readonly source: "staged" | "working-tree" | "untracked";
          readonly status: "reviewed" | "skipped";
          readonly reason?: "binary" | "file-too-large";
          readonly sizeBytes?: string;
          readonly limitBytes?: number;
        }>;
      };
    };

    expect(cliResult.exitCode).toBe(0);
    expect(report.summary).toEqual({
      changedFiles: 3,
      reviewedFiles: 1,
      skippedFiles: 2,
      findings: 0,
    });
    expect(report.coverage.complete).toBe(false);
    expect(report.coverage.files).toEqual([
      {
        path: "binary.dat",
        source: "untracked",
        status: "skipped",
        reason: "binary",
      },
      {
        path: "included.ts",
        source: "working-tree",
        status: "reviewed",
      },
      {
        path: "large.txt",
        source: "untracked",
        status: "skipped",
        reason: "file-too-large",
        sizeBytes: String("large\n".length + 600 * 1024),
        limitBytes: 512 * 1024,
      },
    ]);
  });
});
