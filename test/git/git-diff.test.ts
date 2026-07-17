import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  collectPatches,
  nulSeparatedChangedPaths,
  nulSeparatedPaths,
  unmergedPaths,
} from "../../src/git/git-diff";
import { GitInvalidOutputError } from "../../src/git/git-errors";
import type * as CommandRunner from "../../src/platform/command-runner";
import type * as FileInspector from "../../src/platform/file-inspector";

const operation = "list changed files";

describe("Git NUL-separated output parsing", () => {
  test("preserves statuses, scores, rename paths, and special filenames", async () => {
    const specialPath = "src/line\nwith\ttabs.ts";
    const changes = await nulSeparatedChangedPaths(
      `U\0src/conflict.ts\0R100\0src/old.ts\0src/new.ts\0M\0${specialPath}\0`,
      operation,
    ).pipe(Effect.runPromise);

    expect(changes).toEqual([
      {
        status: "U",
        path: "src/conflict.ts",
        pathspecs: ["src/conflict.ts"],
      },
      {
        status: "M",
        path: specialPath,
        pathspecs: [specialPath],
      },
      {
        status: "R",
        score: 100,
        path: "src/new.ts",
        pathspecs: ["src/old.ts", "src/new.ts"],
      },
    ]);
  });

  test("accepts empty output and sorts plain paths", async () => {
    expect(
      await nulSeparatedChangedPaths("", operation).pipe(Effect.runPromise),
    ).toEqual([]);
    expect(
      await nulSeparatedPaths("z.ts\0a.ts\0", operation).pipe(
        Effect.runPromise,
      ),
    ).toEqual(["a.ts", "z.ts"]);
  });

  test("deduplicates and sorts unmerged paths", () => {
    expect(
      unmergedPaths([
        { status: "U", path: "z.ts", pathspecs: ["z.ts"] },
        { status: "M", path: "a.ts", pathspecs: ["a.ts"] },
        { status: "U", path: "z.ts", pathspecs: ["z.ts"] },
        { status: "U", path: "b.ts", pathspecs: ["b.ts"] },
      ]),
    ).toEqual(["b.ts", "z.ts"]);
  });

  test.each([
    ["missing final NUL", "A\0file.ts"],
    ["missing rename target", "R100\0old.ts\0"],
    ["unknown status", "Q\0file.ts\0"],
    ["invalid score", "R101\0old.ts\0new.ts\0"],
    ["empty path", "A\0\0"],
  ])("rejects %s", async (_name, output) => {
    const error = await nulSeparatedChangedPaths(output, operation).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    expect(error.operation).toBe(operation);
    expect(error.outputBytes).toBe(Buffer.byteLength(output));
  });

  test("rejects malformed plain path output", async () => {
    const output = "complete.ts\0partial.ts";
    const error = await nulSeparatedPaths(output, operation).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    expect(error.outputBytes).toBe(Buffer.byteLength(output));
  });
});

describe("Git patch collection", () => {
  test("processes files concurrently without exceeding the configured limit", async () => {
    let activeCommands = 0;
    let peakActiveCommands = 0;
    const runner: CommandRunner.Service = {
      run: (request) =>
        Effect.promise(async () => {
          activeCommands += 1;
          peakActiveCommands = Math.max(peakActiveCommands, activeCommands);
          await Bun.sleep(5);
          activeCommands -= 1;

          const args = request.args ?? [];
          if (args.includes("rev-parse")) {
            return { stdout: "a".repeat(40), stderr: "", exitCode: 0 };
          }
          if (args.includes("cat-file")) {
            return { stdout: "1\n", stderr: "", exitCode: 0 };
          }
          return {
            stdout: "diff --git a/file.ts b/file.ts\n",
            stderr: "",
            exitCode: 0,
          };
        }),
    };
    const inspector: FileInspector.Service = {
      size: () => Effect.succeed(1n),
    };
    const changes = Array.from({ length: 12 }, (_, index) => {
      const path = `file-${index}.ts`;
      return { path, pathspecs: [path] };
    });

    const collection = await collectPatches(
      runner,
      inspector,
      changes,
      "staged",
      "/repo",
    ).pipe(Effect.runPromise);

    expect(collection.files).toHaveLength(changes.length);
    expect(peakActiveCommands).toBe(4);
  });
});
