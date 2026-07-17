import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  findUnmergedPaths,
  mergePatchTargetsByPath,
  parseChangeStatus,
  parseNulSeparatedChanges,
  parseNulSeparatedPaths,
} from "../../src/git/git-change-parser";
import { GitInvalidOutputError } from "../../src/git/git-errors";

const operation = "list changed files";

describe("Git change parsing", () => {
  test("preserves statuses, scores, rename paths, and special filenames", async () => {
    const specialPath = "src/line\nwith\ttabs.ts";
    const changes = await parseNulSeparatedChanges(
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

  test("parses copy status and optional modification score", () => {
    expect(parseChangeStatus("C075")).toEqual({ status: "C", score: 75 });
    expect(parseChangeStatus("M042")).toEqual({ status: "M", score: 42 });
    expect(parseChangeStatus("M")).toEqual({ status: "M" });
    expect(parseChangeStatus("R101")).toBeUndefined();
  });

  test("accepts empty output and sorts plain paths", async () => {
    expect(
      await parseNulSeparatedChanges("", operation).pipe(Effect.runPromise),
    ).toEqual([]);
    expect(
      await parseNulSeparatedPaths("z.ts\0a.ts\0", operation).pipe(
        Effect.runPromise,
      ),
    ).toEqual(["a.ts", "z.ts"]);
  });

  test("deduplicates and sorts conflict paths", () => {
    expect(
      findUnmergedPaths([
        { status: "U", path: "z.ts", pathspecs: ["z.ts"] },
        { status: "M", path: "a.ts", pathspecs: ["a.ts"] },
        { status: "U", path: "z.ts", pathspecs: ["z.ts"] },
        { status: "U", path: "b.ts", pathspecs: ["b.ts"] },
      ]),
    ).toEqual(["b.ts", "z.ts"]);
  });

  test("merges patch targets and preserves every rename pathspec", () => {
    expect(
      mergePatchTargetsByPath([
        { status: "M", path: "new.ts", pathspecs: ["new.ts"] },
        {
          status: "R",
          score: 100,
          path: "new.ts",
          pathspecs: ["old.ts", "new.ts"],
        },
        { status: "A", path: "a.ts", pathspecs: ["a.ts"] },
      ]),
    ).toEqual([
      { path: "a.ts", pathspecs: ["a.ts"] },
      { path: "new.ts", pathspecs: ["new.ts", "old.ts"] },
    ]);
  });

  test.each([
    ["missing final NUL", "A\0file.ts"],
    ["missing rename target", "R100\0old.ts\0"],
    ["unknown status", "Q\0file.ts\0"],
    ["invalid score", "R101\0old.ts\0new.ts\0"],
    ["empty path", "A\0\0"],
  ])("rejects %s", async (_name, output) => {
    const error = await parseNulSeparatedChanges(output, operation).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    expect(error.operation).toBe(operation);
    expect(error.outputBytes).toBe(Buffer.byteLength(output));
  });

  test("rejects malformed plain path output", async () => {
    const output = "complete.ts\0partial.ts";
    const error = await parseNulSeparatedPaths(output, operation).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    expect(error.outputBytes).toBe(Buffer.byteLength(output));
  });
});
