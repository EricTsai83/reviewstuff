import { describe, expect, test } from "bun:test";
import {
  decodeReviewSelectionV1,
  fallbackReviewRequestEstimator,
  selectReviewHunks,
  type ReviewBudgetFile,
} from "../../src/review/review-budget";

const policyOverhead = {
  fixedRequestOverheadTokens: 17,
  outputReserveTokens: 23,
};

const file = (
  path: string,
  patches: ReadonlyArray<string>,
  fileHeader = "",
): ReviewBudgetFile => ({
  path,
  source: "working-tree",
  fileHeader,
  hunks: patches.map((patch) => ({ patch })),
});

const selectedRequestTokens = (
  files: ReadonlyArray<{
    readonly path: string;
    readonly source: "working-tree";
    readonly patch: string;
  }>,
): number =>
  fallbackReviewRequestEstimator.estimate(JSON.stringify(files));

const budgetFor = (
  files: ReadonlyArray<{
    readonly path: string;
    readonly source: "working-tree";
    readonly patch: string;
  }>,
): number =>
  policyOverhead.fixedRequestOverheadTokens +
  policyOverhead.outputReserveTokens + selectedRequestTokens(files);

const readFixture = async (name: string): Promise<unknown> =>
  JSON.parse(
    await Bun.file(
      `${import.meta.dir}/../fixtures/selections/${name}`,
    ).text(),
  );

describe("review request budget selection", () => {
  test.each([
    "review-selection-v1.json",
    "review-selection-v1-edge.json",
  ])("strictly decodes the %s schema fixture", async (name) => {
    const fixture = await readFixture(name);

    expect(JSON.stringify(decodeReviewSelectionV1(fixture))).toBe(
      JSON.stringify(fixture),
    );
  });

  test("selects complete hunks round-robin with stable output ordering", () => {
    const aHeader = "diff --git a/a.ts b/a.ts\n";
    const aFirst = "@@ -1 +1 @@\n-old a1\n+new a1\n";
    const aSecond = "@@ -3 +3 @@\n-old a2\n+new a2\n";
    const bFirst = "@@ -1 +1 @@\n-old b1\n+new b1\n";
    const expectedFiles = [
      {
        path: "a.ts",
        source: "working-tree" as const,
        patch: `${aHeader}${aFirst}`,
      },
      {
        path: "b.ts",
        source: "working-tree" as const,
        patch: bFirst,
      },
    ];

    const selection = selectReviewHunks({
      files: [file("b.ts", [bFirst]), file("a.ts", [aFirst, aSecond], aHeader)],
      policy: { ...policyOverhead, maxTokens: budgetFor(expectedFiles) },
    });

    expect(selection.files).toEqual(expectedFiles);
    expect(selection.coverage.files).toEqual([
      {
        path: "a.ts",
        source: "working-tree",
        status: "truncated",
        reason: "request-budget",
        selectedHunks: 1,
        totalHunks: 2,
      },
      {
        path: "b.ts",
        source: "working-tree",
        status: "reviewed",
        selectedHunks: 1,
        totalHunks: 1,
      },
    ]);
    expect(selection.estimate.totalReservedTokens).toBe(
      selection.estimate.maxTokens,
    );
  });

  test("an oversized first file does not starve a later small file", () => {
    const huge = `@@ -0,0 +1 @@\n+${"x".repeat(2_000)}\n`;
    const small = "@@ -0,0 +1 @@\n+small\n";
    const expectedFiles = [{
      path: "b-small.ts",
      source: "working-tree" as const,
      patch: small,
    }];

    const selection = selectReviewHunks({
      files: [file("a-huge.ts", [huge]), file("b-small.ts", [small])],
      policy: { ...policyOverhead, maxTokens: budgetFor(expectedFiles) },
    });

    expect(selection.files).toEqual(expectedFiles);
    expect(selection.coverage.files.map(({ status }) => status)).toEqual([
      "skipped",
      "reviewed",
    ]);
  });

  test("can select a later complete hunk when a file's first hunk is too large", () => {
    const huge = `@@ -0,0 +1 @@\n+${"雪".repeat(1_000)}\n`;
    const small = "@@ -3 +3 @@\n-old\n+new\n";
    const expectedFiles = [{
      path: "mixed.ts",
      source: "working-tree" as const,
      patch: small,
    }];

    const selection = selectReviewHunks({
      files: [file("mixed.ts", [huge, small])],
      policy: { ...policyOverhead, maxTokens: budgetFor(expectedFiles) },
    });

    expect(selection.files).toEqual(expectedFiles);
    expect(selection.files[0]?.patch).toBe(small);
    expect(selection.coverage.files[0]).toMatchObject({
      status: "truncated",
      selectedHunks: 1,
      totalHunks: 2,
    });
  });

  test("zero budget skips every file without producing a partial hunk", () => {
    const selection = selectReviewHunks({
      files: [
        file("code.ts", ["@@ -0,0 +1 @@\n+code\n"]),
        file("metadata.ts", [], "old mode 100644\nnew mode 100755\n"),
      ],
      policy: {
        maxTokens: 0,
        fixedRequestOverheadTokens: 0,
        outputReserveTokens: 0,
      },
    });

    expect(selection.files).toEqual([]);
    expect(selection.coverage.complete).toBe(false);
    expect(selection.coverage.files.every((entry) => entry.status === "skipped"))
      .toBe(true);
    expect(selection.estimate).toMatchObject({
      selectedRequestTokens: 0,
      totalReservedTokens: 0,
      fitsBudget: true,
    });
  });

  test("fallback estimation includes UTF-8 bytes after JSON escaping", () => {
    const serialized = JSON.stringify({
      path: "src/雪.ts",
      patch: "line\n\u0000\"\\end",
    });
    const expectedBytes = new TextEncoder().encode(serialized).byteLength;

    expect(fallbackReviewRequestEstimator.estimate(serialized)).toBe(
      expectedBytes,
    );
    expect(expectedBytes).toBeGreaterThan(serialized.length);
  });

  test("identical input and policy produce identical selection", () => {
    const input = {
      files: [
        file("z.ts", ["@@ -0,0 +1 @@\n+z\n"]),
        file("a.ts", ["@@ -0,0 +1 @@\n+a\n"]),
      ],
      policy: { ...policyOverhead, maxTokens: 10_000 },
    };

    expect(JSON.stringify(selectReviewHunks(input))).toBe(
      JSON.stringify(selectReviewHunks(input)),
    );
  });

  test("rejects invalid policies and duplicate file identities", () => {
    expect(() =>
      selectReviewHunks({
        files: [],
        policy: {
          maxTokens: -1,
          fixedRequestOverheadTokens: 0,
          outputReserveTokens: 0,
        },
      })
    ).toThrow(RangeError);
    expect(() =>
      selectReviewHunks({
        files: [file("same.ts", []), file("same.ts", [])],
        policy: {
          maxTokens: 0,
          fixedRequestOverheadTokens: 0,
          outputReserveTokens: 0,
        },
      })
    ).toThrow("duplicate review file identity");
  });
});
