import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import { GitInvalidOutputError } from "../../src/git/git-errors";
import { parseUnifiedDiff } from "../../src/git/unified-diff-parser";

const operation = "parse diff";

describe("unified diff parsing", () => {
  test.each([
    ["missing final newline", "diff --git a/a.ts b/a.ts"],
    ["missing file header", "--- a/a.ts\n+++ b/a.ts\n"],
    [
      "malformed hunk header",
      "diff --git a/a.ts b/a.ts\n@@ malformed @@\n",
    ],
    [
      "unsafe integer",
      "diff --git a/a.ts b/a.ts\n@@ -9007199254740992 +1 @@\n-old\n+new\n",
    ],
    [
      "orphan newline marker",
      "diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n\\ No newline at end of file\n",
    ],
    [
      "truncated content headers",
      "diff --git a/a.ts b/a.ts\nindex 1111111..2222222 100644\n--- a/a.ts\n",
    ],
    [
      "a malformed record after a valid one",
      "diff --git a/a.ts b/a.ts\nold mode 100644\nnew mode 100755\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n",
    ],
  ])("rejects %s", async (_name, output) => {
    const error = await parseUnifiedDiff(output, operation).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    expect(error.outputBytes).toBe(Buffer.byteLength(output));
  });

  test("preserves a metadata-only text change", async () => {
    const output =
      "diff --git a/a.ts b/a.ts\nold mode 100644\nnew mode 100755\n";

    expect(
      await parseUnifiedDiff(output, operation).pipe(Effect.runPromise),
    ).toEqual([{
      fileHeader: output,
      hunks: [],
      binary: false,
      patch: output,
      path: "a.ts",
    }]);
  });

  test.each([
    [
      "empty added file",
      "diff --git a/empty.txt b/empty.txt\nnew file mode 100644\nindex 0000000..e69de29\n",
      "empty.txt",
    ],
    [
      "copy",
      "diff --git a/original.ts b/copy.ts\nsimilarity index 100%\ncopy from original.ts\ncopy to copy.ts\n",
      "copy.ts",
    ],
  ])("accepts complete metadata-only %s", async (_name, output, path) => {
    expect(
      await parseUnifiedDiff(output, operation).pipe(Effect.runPromise),
    ).toEqual([{
      fileHeader: output,
      hunks: [],
      binary: false,
      patch: output,
      path,
    }]);
  });

  test("splits a typechange into its delete and create records", async () => {
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
    const createRecord = [
      "diff --git a/link.txt b/link.txt",
      "new file mode 120000",
      "index 0000000..78accb3",
      "--- /dev/null",
      "+++ b/link.txt",
      "@@ -0,0 +1 @@",
      "+target.txt",
      "\\ No newline at end of file",
      "",
    ].join("\n");

    const records = await parseUnifiedDiff(
      `${deleteRecord}${createRecord}`,
      operation,
    ).pipe(Effect.runPromise);

    expect(records.map((record) => record.patch)).toEqual([
      deleteRecord,
      createRecord,
    ]);
    expect(records.map((record) => record.path)).toEqual([
      "link.txt",
      "link.txt",
    ]);
    expect(records.map((record) => record.hunks.length)).toEqual([1, 1]);
  });

  test("attributes a copy record and a modified source record separately", async () => {
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

    const records = await parseUnifiedDiff(
      `${copyRecord}${modifiedSourceRecord}`,
      operation,
    ).pipe(Effect.runPromise);

    expect(records.map((record) => record.path)).toEqual([
      "copy.txt",
      "src.txt",
    ]);
  });

  test("reads a path from content headers instead of hunk content", async () => {
    const output = [
      "diff --git a/a.ts b/a.ts",
      "index 1111111..2222222 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "--- b/decoy.ts",
      "+++ b/decoy.ts",
      "",
    ].join("\n");

    const records = await parseUnifiedDiff(output, operation).pipe(
      Effect.runPromise,
    );

    expect(records.map((record) => record.path)).toEqual(["a.ts"]);
  });

  test.each([
    [
      "bare",
      [
        "diff --git a/my link.txt b/my link.txt",
        "index 1111111..2222222 100644",
        "--- a/my link.txt\t",
        "+++ b/my link.txt\t",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "",
      ].join("\n"),
      "my link.txt",
    ],
    [
      "quoted",
      [
        'diff --git "a/say \\"hi\\" there.txt" "b/say \\"hi\\" there.txt"',
        "index 1111111..2222222 100644",
        '--- "a/say \\"hi\\" there.txt"\t',
        '+++ "b/say \\"hi\\" there.txt"\t',
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "",
      ].join("\n"),
      'say "hi" there.txt',
    ],
  ])(
    // Git terminates a content header with a tab when the path contains a
    // space, which must not become part of the attributed path.
    "attributes a %s path containing a space",
    async (_kind, output, path) => {
      const records = await parseUnifiedDiff(output, operation).pipe(
        Effect.runPromise,
      );

      expect(records.map((record) => record.path)).toEqual([path]);
    },
  );

  test("decodes a quoted path", async () => {
    const output = [
      'diff --git "a/say \\"hi\\".ts" "b/say \\"hi\\".ts"',
      "index 1111111..2222222 100644",
      '--- "a/say \\"hi\\".ts"',
      '+++ "b/say \\"hi\\".ts"',
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");

    const records = await parseUnifiedDiff(output, operation).pipe(
      Effect.runPromise,
    );

    expect(records.map((record) => record.path)).toEqual(['say "hi".ts']);
  });

  test("keeps a binary record identifiable without hunks", async () => {
    const output =
      "diff --git a/image.dat b/image.dat\nBinary files a/image.dat and b/image.dat differ\n";

    expect(
      await parseUnifiedDiff(output, operation).pipe(Effect.runPromise),
    ).toEqual([{
      fileHeader: output,
      hunks: [],
      binary: true,
      patch: output,
      path: "image.dat",
    }]);
  });
});
