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

  test("reports a typechange once by merging its delete and create records", async () => {
    const fixture = makeGitRunnerFixture();
    const deleteRecord = [
      "diff --git a/link.txt b/link.txt",
      "deleted file mode 100644",
      "index ce01362..0000000",
      "--- a/link.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-hello",
      "",
    ].join("\n");
    const createHeader = [
      "diff --git a/link.txt b/link.txt",
      "new file mode 120000",
      "index 0000000..78accb3",
      "--- /dev/null",
      "+++ b/link.txt",
      "",
    ].join("\n");
    const createHunk = "@@ -0,0 +1 @@\n+target.txt\n";
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("link.txt"),
      gitResult(`${deleteRecord}${createHeader}${createHunk}`),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "link.txt",
        pathspecs: ["link.txt"],
        status: "T",
      }],
      source: "working-tree",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.files).toHaveLength(1);
    const [file] = collection.files;
    expect(file).toMatchObject({
      kind: "text",
      path: "link.txt",
      status: "T",
      patch: `${deleteRecord}${createHeader}${createHunk}`,
    });
    // The second record repeats its own header on each of its hunks, so any
    // selected subset still reconstructs a valid multi-record diff.
    expect(file?.kind === "text" ? file.hunks.map((hunk) => hunk.patch) : [])
      .toEqual([
        "@@ -1 +0,0 @@\n-hello\n",
        `${createHeader}${createHunk}`,
      ]);
    fixture.verify();
  });

  test("repeats a later record header on every one of its hunks", async () => {
    const fixture = makeGitRunnerFixture();
    const deleteRecord = [
      "diff --git a/swap.txt b/swap.txt",
      "deleted file mode 100644",
      "index ce01362..0000000",
      "--- a/swap.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-hello",
      "",
    ].join("\n");
    const createHeader = [
      "diff --git a/swap.txt b/swap.txt",
      "new file mode 100644",
      "index 0000000..3333333",
      "--- /dev/null",
      "+++ b/swap.txt",
      "",
    ].join("\n");
    const firstCreateHunk = "@@ -0,0 +1 @@\n+first\n";
    const secondCreateHunk = "@@ -0,0 +5 @@\n+second\n";
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("swap.txt"),
      gitResult(
        `${deleteRecord}${createHeader}${firstCreateHunk}${secondCreateHunk}`,
      ),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "swap.txt",
        pathspecs: ["swap.txt"],
        status: "T",
      }],
      source: "working-tree",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    const [file] = collection.files;
    // The request budget can select the second hunk without the first, so both
    // must carry the header that identifies the record they belong to.
    expect(file?.kind === "text" ? file.hunks.map((hunk) => hunk.patch) : [])
      .toEqual([
        "@@ -1 +0,0 @@\n-hello\n",
        `${createHeader}${firstCreateHunk}`,
        `${createHeader}${secondCreateHunk}`,
      ]);
    fixture.verify();
  });

  test.each([
    [
      "leading",
      [
        "diff --git a/edge.txt b/edge.txt",
        "deleted file mode 100644",
        "index e69de29..0000000",
        "",
      ].join("\n"),
      [
        "diff --git a/edge.txt b/edge.txt",
        "new file mode 120000",
        "index 0000000..78accb3",
        "--- /dev/null",
        "+++ b/edge.txt",
        "@@ -0,0 +1 @@",
        "+target.txt",
        "",
      ].join("\n"),
    ],
    [
      "trailing",
      [
        "diff --git a/edge.txt b/edge.txt",
        "deleted file mode 120000",
        "index 78accb3..0000000",
        "--- a/edge.txt",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-target.txt",
        "",
      ].join("\n"),
      [
        "diff --git a/edge.txt b/edge.txt",
        "new file mode 100644",
        "index 0000000..e69de29",
        "",
      ].join("\n"),
    ],
  ])(
    // An empty file becoming a symlink produces a header-only delete record;
    // a symlink becoming an empty file produces a header-only create record.
    "reconstructs a typechange with a %s header-only record",
    async (_position, firstRecord, secondRecord) => {
      const fixture = makeGitRunnerFixture();
      fixture.expectGit(
        (args) => args[0] === "diff" && args.includes("edge.txt"),
        gitResult(`${firstRecord}${secondRecord}`),
      );

      const collection = await collectDiffPatches({
        runner: fixture.runner,
        targets: [{
          path: "edge.txt",
          pathspecs: ["edge.txt"],
          status: "T",
        }],
        source: "working-tree",
        repositoryRoot,
      }).pipe(Effect.runPromise);

      const [file] = collection.files;
      if (file?.kind !== "text") {
        throw new Error("Expected a text file");
      }
      // Selecting every hunk must reproduce both records, so no metadata is
      // lost when one of them contributes no hunk of its own.
      expect(
        `${file.fileHeader}${file.hunks.map((hunk) => hunk.patch).join("")}`,
      ).toBe(`${firstRecord}${secondRecord}`);
      fixture.verify();
    },
  );

  test("refuses to attribute a record that reports another path", async () => {
    const fixture = makeGitRunnerFixture();
    const output = addedPatch("other.ts");
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("wanted.ts"),
      gitResult(output),
    );

    const error = await collectDiffPatches({
      runner: fixture.runner,
      targets: [target("wanted.ts")],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    fixture.verify();
  });

  test("collects only the copy record when the copy source also changed", async () => {
    const fixture = makeGitRunnerFixture();
    const copyRecord = [
      "diff --git a/src.txt b/copy.txt",
      "similarity index 100%",
      "copy from src.txt",
      "copy to copy.txt",
      "",
    ].join("\n");
    const modifiedSourceRecord = [
      "diff --git a/src.txt b/src.txt",
      "index 35fbd83..1253dfb 100644",
      "--- a/src.txt",
      "+++ b/src.txt",
      "@@ -1 +1,2 @@",
      " aaa",
      "+EXTRA",
      "",
    ].join("\n");
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("copy.txt"),
      gitResult(`${copyRecord}${modifiedSourceRecord}`),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "copy.txt",
        pathspecs: ["src.txt", "copy.txt"],
        status: "C",
        score: 100,
        previousPath: "src.txt",
      }],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.files).toEqual([{
      kind: "text",
      path: "copy.txt",
      previousPath: "src.txt",
      score: 100,
      source: "staged",
      status: "C",
      patch: copyRecord,
      fileHeader: copyRecord,
      hunks: [],
    }]);
    fixture.verify();
  });

  test("fails when no record can be attributed to the requested path", async () => {
    const fixture = makeGitRunnerFixture();
    const output = `${addedPatch("other.ts")}${addedPatch("another.ts")}`;
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("wanted.ts"),
      gitResult(output),
    );

    const error = await collectDiffPatches({
      runner: fixture.runner,
      targets: [{
        path: "wanted.ts",
        pathspecs: ["missing.ts", "wanted.ts"],
        status: "R",
        previousPath: "missing.ts",
      }],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    if (!(error instanceof GitInvalidOutputError)) {
      throw new Error("Expected GitInvalidOutputError");
    }
    expect(error.outputBytes).toBe(Buffer.byteLength(output));
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
