import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import { collectDiffPatches } from "../../src/git/git-diff";
import {
  GitChangedFileUnavailableError,
  GitCommandOutputLimitError,
  GitInvalidOutputError,
} from "../../src/git/git-errors";
import { CommandOutputLimitError } from "../../src/platform/command-runner";
import { gitResult, makeGitRunnerFixture } from "./git-runner-fixture";

const repositoryRoot = "/repo";
const target = (path: string) => ({
  path,
  pathspecs: [path],
  status: "M" as const,
});
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

describe("Git diff patch collection", () => {
  test("preserves normalized change and complete hunk metadata", async () => {
    const fixture = makeGitRunnerFixture();
    const patch = [
      "diff --git a/file.ts b/file.ts",
      "index 1111111..2222222 100644",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1 +1,2 @@ exported",
      "-old",
      "+new",
      "+added",
      "@@ -10,2 +11 @@",
      " context",
      "-removed",
      "\\ No newline at end of file",
      "",
    ].join("\n");
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("file.ts"),
      gitResult(patch),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: [target("file.ts")],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.files).toEqual([
      {
        kind: "text",
        path: "file.ts",
        source: "staged",
        status: "M",
        patch,
        fileHeader: [
          "diff --git a/file.ts b/file.ts",
          "index 1111111..2222222 100644",
          "--- a/file.ts",
          "+++ b/file.ts",
          "",
        ].join("\n"),
        hunks: [
          {
            header: "@@ -1 +1,2 @@ exported",
            oldStartLine: 1,
            oldLineCount: 1,
            newStartLine: 1,
            newLineCount: 2,
            patch: "@@ -1 +1,2 @@ exported\n-old\n+new\n+added\n",
          },
          {
            header: "@@ -10,2 +11 @@",
            oldStartLine: 10,
            oldLineCount: 2,
            newStartLine: 11,
            newLineCount: 1,
            patch:
              "@@ -10,2 +11 @@\n context\n-removed\n\\ No newline at end of file\n",
          },
        ],
      },
    ]);
    fixture.verify();
  });

  test("preserves binary identity and rename metadata", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("image.dat"),
      gitResult(
        "diff --git a/old.dat b/image.dat\nBinary files a/old.dat and b/image.dat differ\n",
      ),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "image.dat",
        pathspecs: ["old.dat", "image.dat"],
        status: "R",
        score: 80,
        previousPath: "old.dat",
      }],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.files).toEqual([
      {
        kind: "binary",
        path: "image.dat",
        previousPath: "old.dat",
        score: 80,
        source: "staged",
        status: "R",
      },
    ]);
    fixture.verify();
  });

  test("collects a large text file instead of applying an AI budget policy", async () => {
    const fixture = makeGitRunnerFixture();
    const patch = addedPatch("large.txt", "x".repeat(600 * 1024));
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("large.txt"),
      gitResult(patch, 1),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "large.txt",
        pathspecs: ["large.txt"],
        status: "A",
      }],
      source: "untracked",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.files[0]).toMatchObject({
      kind: "text",
      path: "large.txt",
      status: "A",
    });
    expect(collection.files[0]?.kind === "text"
      ? collection.files[0].hunks[0]?.newLineCount
      : undefined).toBe(1);
    fixture.verify();
  });

  test("rejects malformed or truncated hunks all-or-nothing", async () => {
    const fixture = makeGitRunnerFixture();
    const malformed = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,2 +1,2 @@",
      "-only-one-old-line",
      "+only-one-new-line",
      "",
    ].join("\n");
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("file.ts"),
      gitResult(malformed),
    );

    const error = await collectDiffPatches({
      runner: fixture.runner,
      targets: [target("file.ts")],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    if (!(error instanceof GitInvalidOutputError)) {
      throw new Error("Expected GitInvalidOutputError");
    }
    expect(error.outputBytes).toBe(Buffer.byteLength(malformed));
    fixture.verify();
  });

  test("keeps the command output cap as a fatal typed failure", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("file.ts"),
      new CommandOutputLimitError({
        program: "git",
        maxOutputBytes: 4 * 1024 * 1024,
        observedOutputBytes: 4 * 1024 * 1024 + 1,
      }),
    );

    const error = await collectDiffPatches({
      runner: fixture.runner,
      targets: [target("file.ts")],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitCommandOutputLimitError);
    fixture.verify();
  });

  test("fails when an untracked file becomes unavailable", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("gone.ts"),
      gitResult("", 1),
    );
    fixture.expectGit(
      ["hash-object", "--no-filters", "--", "gone.ts"],
      gitResult("", 128, "fatal: could not open 'gone.ts'"),
    );
    const error = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "gone.ts",
        pathspecs: ["gone.ts"],
        status: "A",
      }],
      source: "untracked",
      repositoryRoot,
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitChangedFileUnavailableError);
    fixture.verify();
  });

  test("preserves an empty untracked file without inventing a hunk", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("empty.txt"),
      gitResult(""),
    );
    fixture.expectGit(
      ["hash-object", "--no-filters", "--", "empty.txt"],
      gitResult(`${"e".repeat(40)}\n`),
    );
    fixture.expectGit(
      ["hash-object", "--no-filters", "--", "/dev/null"],
      gitResult(`${"e".repeat(40)}\n`),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "empty.txt",
        pathspecs: ["empty.txt"],
        status: "A",
      }],
      source: "untracked",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.files).toEqual([{
      kind: "text",
      path: "empty.txt",
      source: "untracked",
      status: "A",
      patch: "",
      fileHeader: "",
      hunks: [],
    }]);
    fixture.verify();
  });

  test("fails if an untracked file gains content during empty-file verification", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("changing.txt"),
      gitResult(""),
    );
    fixture.expectGit(
      ["hash-object", "--no-filters", "--", "changing.txt"],
      gitResult(`${"a".repeat(40)}\n`),
    );
    fixture.expectGit(
      ["hash-object", "--no-filters", "--", "/dev/null"],
      gitResult(`${"e".repeat(40)}\n`),
    );

    const error = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "changing.txt",
        pathspecs: ["changing.txt"],
        status: "A",
      }],
      source: "untracked",
      repositoryRoot,
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitChangedFileUnavailableError);
    fixture.verify();
  });

  test("limits concurrent patch work and preserves target order", async () => {
    const fixture = makeGitRunnerFixture();
    let activeCommands = 0;
    let peakActiveCommands = 0;
    const paths = Array.from({ length: 12 }, (_, index) => `file-${index}.ts`);

    for (const [index, path] of paths.entries()) {
      fixture.expectGit(
        (args) => args[0] === "diff" && args.includes(path),
        () =>
          Effect.promise(async () => {
            activeCommands += 1;
            peakActiveCommands = Math.max(peakActiveCommands, activeCommands);
            await Bun.sleep(12 - index);
            activeCommands -= 1;
            return gitResult(addedPatch(path));
          }),
        `patch for ${path}`,
      );
    }

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: paths.map((path) => ({
        path,
        pathspecs: [path],
        status: "A" as const,
      })),
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(peakActiveCommands).toBe(4);
    expect(collection.files.map((file) => file.path)).toEqual(paths);
    fixture.verify();
  });
});
