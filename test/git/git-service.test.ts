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
import { gitResult, makeGitRunnerFixture } from "./git-runner-fixture";

const detectRepository = ["rev-parse", "--is-inside-work-tree"] as const;
const resolveRepositoryRoot = ["rev-parse", "--show-toplevel"] as const;
const listStaged = [
  "diff",
  "--cached",
  "--find-copies-harder",
  "--name-status",
  "-z",
  "--diff-filter=ACDMRTUXB",
  "--",
] as const;
const listUnstaged = [
  "diff",
  "--find-copies-harder",
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

const provideGit = (runner: Service) =>
  layer.pipe(
    Layer.provide(Layer.succeed(CommandRunner, runner)),
  );

const readDiff = (
  runner: Service,
  scope: "staged" | "working-tree",
) =>
  GitService.pipe(
    Effect.flatMap((git) => git.readDiff(scope)),
    Effect.provide(provideGit(runner)),
  );

const addedPatch = (path: string, content = "export const added = true;") =>
  [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${path}`,
    "@@ -0,0 +1 @@",
    `+${content}`,
    "",
  ].join("\n");

const modifiedPatch = (path: string) =>
  [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "",
  ].join("\n");

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
    expectRepositoryPrelude(fixture, "A\0staged.ts\0");
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes("--cached") &&
        args.includes("staged.ts"),
      gitResult(addedPatch("staged.ts")),
      "staged patch",
    );

    const diff = await readDiff(fixture.runner, "staged").pipe(
      Effect.runPromise,
    );

    expect(diff.files[0]).toMatchObject({
      kind: "text",
      path: "staged.ts",
      source: "staged",
      status: "A",
      hunks: [{ oldLineCount: 0, newLineCount: 1 }],
    });
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
        args[1] === "HEAD" &&
        args.includes("--name-status"),
      gitResult("M\0tracked.ts\0"),
      "normalized working-tree changes",
    );
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes("HEAD") &&
        args.filter((argument) => argument === "tracked.ts").length === 1,
      gitResult(modifiedPatch("tracked.ts")),
      "merged tracked patch",
    );
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes("--no-index") &&
        args.includes("new.ts"),
      gitResult(addedPatch("new.ts"), 1),
      "untracked patch",
    );

    const diff = await readDiff(fixture.runner, "working-tree").pipe(
      Effect.runPromise,
    );

    expect(diff.files).toMatchObject([
      {
        kind: "text",
        path: "tracked.ts",
        source: "working-tree",
        status: "M",
      },
      { kind: "text", path: "new.ts", source: "untracked", status: "A" },
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
        args[1] === emptyTreeObjectId &&
        args.includes("--name-status"),
      gitResult("A\0file.ts\0"),
      "initial working-tree changes",
    );
    fixture.expectGit(
      (args) =>
        args[0] === "diff" &&
        args.includes(emptyTreeObjectId) &&
        args.includes("file.ts"),
      gitResult(addedPatch("file.ts")),
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
  test("preserves copy status, score, and source identity", async () => {
    const repository = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fileSystem) =>
        fileSystem.makeTempDirectory({ prefix: "reviewstuff-git-copy-" })
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );

    await runGit(repository, ["init", "--quiet"]).pipe(Effect.runPromise);
    await runGit(repository, ["config", "user.email", "test@example.com"])
      .pipe(Effect.runPromise);
    await runGit(repository, ["config", "user.name", "Test"])
      .pipe(Effect.runPromise);
    const original = "export const copied = true;\n";
    await Bun.write(`${repository}/original.ts`, original);
    await runGit(repository, ["add", "original.ts"]).pipe(Effect.runPromise);
    await runGit(repository, ["commit", "--quiet", "-m", "base"])
      .pipe(Effect.runPromise);
    await Bun.write(`${repository}/copy.ts`, original);
    await runGit(repository, ["add", "copy.ts"]).pipe(Effect.runPromise);

    const liveRunner = await CommandRunner.pipe(
      Effect.provide(commandRunnerLive),
      Effect.runPromise,
    );
    const repositoryRunner: Service = {
      run: (request) =>
        liveRunner.run({
          ...request,
          workingDirectory: request.workingDirectory ?? repository,
        }),
    };
    const diff = await readDiff(repositoryRunner, "staged").pipe(
      Effect.runPromise,
    );

    expect(diff.files).toEqual([{
      kind: "text",
      path: "copy.ts",
      previousPath: "original.ts",
      score: 100,
      source: "staged",
      status: "C",
      patch: [
        "diff --git a/original.ts b/copy.ts",
        "similarity index 100%",
        "copy from original.ts",
        "copy to copy.ts",
        "",
      ].join("\n"),
      fileHeader: [
        "diff --git a/original.ts b/copy.ts",
        "similarity index 100%",
        "copy from original.ts",
        "copy to copy.ts",
        "",
      ].join("\n"),
      hunks: [],
    }]);
  });

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
    await Bun.write(`${repository}/empty.txt`, "");
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
        readonly truncatedFiles: number;
        readonly skippedFiles: number;
        readonly findings: number;
      };
      readonly coverage: {
        readonly complete: boolean;
        readonly files: ReadonlyArray<{
          readonly path: string;
          readonly source: "staged" | "working-tree" | "untracked";
          readonly status: "reviewed" | "truncated" | "skipped";
          readonly reason?: "binary" | "file-too-large" | "request-budget";
          readonly selectedHunks?: number;
          readonly totalHunks?: number;
          readonly sizeBytes?: string;
          readonly limitBytes?: number;
        }>;
      };
    };

    expect(cliResult.exitCode).toBe(0);
    expect(report.summary).toEqual({
      changedFiles: 4,
      reviewedFiles: 2,
      truncatedFiles: 0,
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
        path: "empty.txt",
        source: "untracked",
        status: "reviewed",
        selectedHunks: 0,
        totalHunks: 0,
      },
      {
        path: "included.ts",
        source: "working-tree",
        status: "reviewed",
        selectedHunks: 1,
        totalHunks: 1,
      },
      {
        path: "large.txt",
        source: "untracked",
        status: "skipped",
        reason: "request-budget",
        selectedHunks: 0,
        totalHunks: 1,
      },
    ]);
  });
});
