import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import { collectDiffPatches } from "../../src/git/git-diff";
import { GitChangedFileUnavailableError } from "../../src/git/git-errors";
import type * as FileInspector from "../../src/platform/file-inspector";
import { gitResult, makeGitRunnerFixture } from "./git-runner-fixture";

const repositoryRoot = "/repo";
const objectId = "a".repeat(40);
const target = (path: string) => ({ path, pathspecs: [path] });
const stagedSizeCommands = (
  fixture: ReturnType<typeof makeGitRunnerFixture>,
  path: string,
  size: bigint,
  id = objectId,
) => {
  fixture.expectGit(
    ["rev-parse", "--verify", "--quiet", `:./${path}`],
    gitResult(id),
  );
  fixture.expectGit(["cat-file", "-s", id], gitResult(`${size}\n`));
};

describe("Git diff patch collection", () => {
  test("collects a staged text patch", async () => {
    const fixture = makeGitRunnerFixture();
    stagedSizeCommands(fixture, "file.ts", 12n);
    fixture.expectGit(
      [
        "diff",
        "--cached",
        "--find-renames",
        "--no-color",
        "--no-ext-diff",
        "--unified=3",
        "--",
        "file.ts",
      ],
      gitResult("diff --git a/file.ts b/file.ts\n"),
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      inspector: { size: () => Effect.die("unused") },
      targets: [target("file.ts")],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection).toEqual({
      files: [
        {
          path: "file.ts",
          source: "staged",
          patch: "diff --git a/file.ts b/file.ts\n",
        },
      ],
      skippedFiles: [],
    });
    fixture.verify();
  });

  test("reports binary patches as skipped", async () => {
    const fixture = makeGitRunnerFixture();
    stagedSizeCommands(fixture, "image.dat", 4n);
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("image.dat"),
      gitResult("Binary files a/image.dat and b/image.dat differ\n"),
      "binary diff",
    );

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      inspector: { size: () => Effect.die("unused") },
      targets: [target("image.dat")],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.skippedFiles).toEqual([
      { path: "image.dat", source: "staged", reason: "binary" },
    ]);
    fixture.verify();
  });

  test("skips oversized files without reading a patch", async () => {
    const fixture = makeGitRunnerFixture();
    stagedSizeCommands(fixture, "large.txt", 524_289n);

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      inspector: { size: () => Effect.die("unused") },
      targets: [target("large.txt")],
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.skippedFiles).toEqual([
      {
        path: "large.txt",
        source: "staged",
        reason: "file-too-large",
        sizeBytes: "524289",
        limitBytes: 524_288,
      },
    ]);
    fixture.verify();
  });

  test("uses the HEAD object size for a deleted working-tree file", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      ["rev-parse", "--verify", "--quiet", "HEAD:deleted.ts"],
      gitResult(objectId),
    );
    fixture.expectGit(["cat-file", "-s", objectId], gitResult("10\n"));
    fixture.expectGit(
      (args) => args[0] === "diff" && args.includes("deleted.ts"),
      gitResult("diff --git a/deleted.ts b/deleted.ts\n"),
      "deleted-file diff",
    );
    const inspector: FileInspector.Service = {
      size: () => Effect.succeed(undefined),
    };

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      inspector,
      targets: [target("deleted.ts")],
      source: "working-tree",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(collection.files[0]?.path).toBe("deleted.ts");
    fixture.verify();
  });

  test("fails when an untracked file becomes unavailable", async () => {
    const fixture = makeGitRunnerFixture();
    const error = await collectDiffPatches({
      runner: fixture.runner,
      inspector: { size: () => Effect.succeed(undefined) },
      targets: [target("gone.ts")],
      source: "untracked",
      repositoryRoot,
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitChangedFileUnavailableError);
    if (!(error instanceof GitChangedFileUnavailableError)) {
      throw new Error("Expected GitChangedFileUnavailableError");
    }
    expect(error.path).toBe("gone.ts");
    fixture.verify();
  });

  test("limits concurrent patch work and preserves target order", async () => {
    const fixture = makeGitRunnerFixture();
    let activeCommands = 0;
    let peakActiveCommands = 0;
    const paths = Array.from({ length: 12 }, (_, index) => `file-${index}.ts`);

    for (const [index, path] of paths.entries()) {
      const id = index.toString(16).padStart(40, "0");
      fixture.expectGit(
        ["rev-parse", "--verify", "--quiet", `:./${path}`],
        () =>
          Effect.promise(async () => {
            activeCommands += 1;
            peakActiveCommands = Math.max(peakActiveCommands, activeCommands);
            await Bun.sleep(12 - index);
            activeCommands -= 1;
            return gitResult(id);
          }),
      );
      fixture.expectGit(["cat-file", "-s", id], gitResult("1\n"));
      fixture.expectGit(
        (args) => args[0] === "diff" && args.includes(path),
        gitResult(`patch:${path}`),
        `patch for ${path}`,
      );
    }

    const collection = await collectDiffPatches({
      runner: fixture.runner,
      inspector: { size: () => Effect.die("unused") },
      targets: paths.map(target),
      source: "staged",
      repositoryRoot,
    }).pipe(Effect.runPromise);

    expect(peakActiveCommands).toBe(4);
    expect(collection.files.map((file) => file.path)).toEqual(paths);
    fixture.verify();
  });
});
