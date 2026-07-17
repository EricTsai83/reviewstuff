import * as BunServices from "@effect/platform-bun/BunServices";
import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import {
  GitCommandError,
  GitExecutionError,
  GitInvalidOutputError,
  GitNotRepositoryError,
  GitService,
  GitUnmergedPathsError,
  GitWorkingTreeUnavailableError,
  layer,
} from "../../src/git/git-service";
import {
  CommandRunner,
  CommandStartError,
  type CommandResult,
  type Service,
  layer as commandRunnerLayer,
} from "../../src/platform/command-runner";
import {
  FileInspector,
  type Service as FileInspectorService,
} from "../../src/platform/file-inspector";
import { gitResult, makeGitRunnerFixture } from "./git-runner-fixture";

const detectRepository = ["rev-parse", "--is-inside-work-tree"] as const;
const resolveRepositoryRoot = ["rev-parse", "--show-toplevel"] as const;
const listStaged = [
  "diff",
  "--cached",
  "--find-renames",
  "--name-status",
  "-z",
  "--diff-filter=ACDMRTUXB",
  "--",
] as const;
const listUnstaged = [
  "diff",
  "--find-renames",
  "--name-status",
  "-z",
  "--diff-filter=ACDMRTUXB",
  "--",
] as const;
const listUntracked = [
  "ls-files",
  "--others",
  "--exclude-standard",
  "-z",
  "--",
] as const;
const resolveHead = [
  "rev-parse",
  "--verify",
  "--quiet",
  "HEAD^{commit}",
] as const;

const provideGit = (
  runner: Service,
  inspector: FileInspectorService = { size: () => Effect.succeed(1n) },
) =>
  layer.pipe(
    Layer.provide(
      Layer.merge(
        Layer.succeed(CommandRunner, runner),
        Layer.succeed(FileInspector, inspector),
      ),
    ),
  );

const readDiff = (
  runner: Service,
  scope: "staged" | "working-tree",
  inspector?: FileInspectorService,
) =>
  GitService.pipe(
    Effect.flatMap((git) => git.readDiff(scope)),
    Effect.provide(provideGit(runner, inspector)),
  );

const expectRepositoryPrelude = (
  fixture: ReturnType<typeof makeGitRunnerFixture>,
  stagedOutput = "",
) => {
  fixture.expectGit(detectRepository, gitResult("true\n"));
  fixture.expectGit(resolveRepositoryRoot, gitResult("/repo\n"));
  fixture.expectGit(listStaged, gitResult(stagedOutput));
};

describe("GitService orchestration", () => {
  test("validates repository and forces a stable English locale", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      detectRepository,
      gitResult("", 128, "fatal: not a git repository"),
    );

    const error = await readDiff(fixture.runner, "working-tree").pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitNotRepositoryError);
    expect(fixture.requests[0]?.environment).toEqual({ LC_ALL: "C" });
    fixture.verify();
  });

  test("rejects a repository without a working tree", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(detectRepository, gitResult("false\n"));

    const error = await readDiff(fixture.runner, "staged").pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitWorkingTreeUnavailableError);
    fixture.verify();
  });

  test("rejects malformed repository detection output using UTF-8 bytes", async () => {
    const fixture = makeGitRunnerFixture();
    const stdout = "錯誤\n";
    fixture.expectGit(detectRepository, gitResult(stdout));

    const error = await readDiff(fixture.runner, "staged").pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    if (!(error instanceof GitInvalidOutputError)) {
      throw new Error("Expected GitInvalidOutputError");
    }
    expect(error.outputBytes).toBe(Buffer.byteLength(stdout));
    fixture.verify();
  });

  test("preserves unexpected repository detection failures", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      detectRepository,
      gitResult(
        "",
        128,
        "fatal: detected dubious ownership; configure safe.directory",
      ),
    );

    const error = await readDiff(fixture.runner, "staged").pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitCommandError);
    if (!(error instanceof GitCommandError)) {
      throw new Error("Expected GitCommandError");
    }
    expect(error.operation).toBe("detect git repository");
    expect(error.failure).toBe("unsafe-repository");
    fixture.verify();
  });

  test("collects only the staged flow for staged scope", async () => {
    const fixture = makeGitRunnerFixture();
    const objectId = "a".repeat(40);
    expectRepositoryPrelude(fixture, "A\0staged.ts\0");
    fixture.expectGit(
      ["rev-parse", "--verify", "--quiet", ":./staged.ts"],
      gitResult(objectId),
    );
    fixture.expectGit(["cat-file", "-s", objectId], gitResult("10\n"));
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes("--cached") &&
        args.includes("staged.ts"),
      gitResult("patch:staged.ts"),
      "staged patch",
    );

    const diff = await readDiff(fixture.runner, "staged").pipe(
      Effect.runPromise,
    );

    expect(diff.files).toEqual([
      { path: "staged.ts", source: "staged", patch: "patch:staged.ts" },
    ]);
    fixture.verify();
  });

  test("combines tracked and untracked working-tree patches", async () => {
    const fixture = makeGitRunnerFixture();
    expectRepositoryPrelude(fixture, "M\0tracked.ts\0");
    fixture.expectGit(listUnstaged, gitResult("M\0tracked.ts\0"));
    fixture.expectGit(listUntracked, gitResult("new.ts\0"));
    fixture.expectGit(resolveHead, gitResult("a".repeat(40)));
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes("HEAD") &&
        args.filter((argument) => argument === "tracked.ts").length === 1,
      gitResult("patch:tracked.ts"),
      "merged tracked patch",
    );
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes("--no-index") &&
        args.includes("new.ts"),
      gitResult("patch:new.ts", 1),
      "untracked patch",
    );

    const diff = await readDiff(fixture.runner, "working-tree").pipe(
      Effect.runPromise,
    );

    expect(diff.files).toEqual([
      {
        path: "tracked.ts",
        source: "working-tree",
        patch: "patch:tracked.ts",
      },
      { path: "new.ts", source: "untracked", patch: "patch:new.ts" },
    ]);
    fixture.verify();
  });

  test("uses the repository-format empty tree in an unborn repository", async () => {
    const fixture = makeGitRunnerFixture();
    const emptyTreeObjectId = "b".repeat(64);
    expectRepositoryPrelude(fixture, "A\0file.ts\0");
    fixture.expectGit(listUnstaged, gitResult(""));
    fixture.expectGit(listUntracked, gitResult(""));
    fixture.expectGit(resolveHead, gitResult("", 1));
    fixture.expectGit(
      ["hash-object", "-t", "tree", "/dev/null"],
      gitResult(`${emptyTreeObjectId}\n`),
    );
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes(emptyTreeObjectId) &&
        args.includes("file.ts"),
      gitResult("patch:file.ts"),
      "initial tracked patch",
    );

    const diff = await readDiff(fixture.runner, "working-tree").pipe(
      Effect.runPromise,
    );

    expect(diff.files[0]?.path).toBe("file.ts");
    fixture.verify();
  });

  test("fails before patch collection when conflicts exist", async () => {
    const fixture = makeGitRunnerFixture();
    expectRepositoryPrelude(fixture, "U\0z.ts\0");
    fixture.expectGit(listUnstaged, gitResult("U\0b.ts\0U\0z.ts\0"));

    const error = await readDiff(fixture.runner, "working-tree").pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitUnmergedPathsError);
    if (!(error instanceof GitUnmergedPathsError)) {
      throw new Error("Expected GitUnmergedPathsError");
    }
    expect(error.paths).toEqual(["b.ts", "z.ts"]);
    fixture.verify();
  });

  test("preserves typed command failures at the orchestration boundary", async () => {
    const fixture = makeGitRunnerFixture();
    const runnerError = new CommandStartError({
      program: "git",
      cause: new Error("spawn failed"),
    });
    fixture.expectGit(detectRepository, runnerError);

    const error = await readDiff(fixture.runner, "working-tree").pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitExecutionError);
    if (!(error instanceof GitExecutionError)) {
      throw new Error("Expected GitExecutionError");
    }
    expect(error.failure).toBe("command-start");
    expect(error.cause).toBe(runnerError);
    fixture.verify();
  });
});

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

describe("GitService temporary repository integration", () => {
  test("blocks staged review when the repository has merge conflicts", async () => {
    const repository = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fileSystem) =>
        fileSystem.makeTempDirectory({ prefix: "reviewstuff-git-conflict-" })
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
        })
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

  test("supports initial repositories, binary files, and large files", async () => {
    const repository = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fileSystem) =>
        fileSystem.makeTempDirectory({ prefix: "reviewstuff-git-service-" })
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );

    await runGit(repository, ["init", "--quiet"]).pipe(Effect.runPromise);
    await Bun.write(
      `${repository}/included.ts`,
      "export const included = true;\n",
    );
    await Bun.write(`${repository}/binary.dat`, new Uint8Array([0, 1, 2, 3]));
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
        })
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
