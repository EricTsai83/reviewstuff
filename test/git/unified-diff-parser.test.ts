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
      "multiple file records",
      "diff --git a/a.ts b/a.ts\ndiff --git a/b.ts b/b.ts\n",
    ],
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
    ).toEqual({ fileHeader: output, hunks: [], binary: false });
  });

  test.each([
    [
      "empty added file",
      "diff --git a/empty.txt b/empty.txt\nnew file mode 100644\nindex 0000000..e69de29\n",
    ],
    [
      "copy",
      "diff --git a/original.ts b/copy.ts\nsimilarity index 100%\ncopy from original.ts\ncopy to copy.ts\n",
    ],
  ])("accepts complete metadata-only %s", async (_name, output) => {
    expect(
      await parseUnifiedDiff(output, operation).pipe(Effect.runPromise),
    ).toEqual({ fileHeader: output, hunks: [], binary: false });
  });
});
