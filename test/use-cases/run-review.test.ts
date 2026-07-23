import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ConfigService,
  resolveReviewConfig,
  UnsupportedReviewSelectionError,
} from "../../src/config/config-service";
import {
  layer as fakeReviewEngine,
  ReviewEngine,
  ReviewEngineFailure,
} from "../../src/engines/review-engine";
import { GitService } from "../../src/git/git-service";
import type { ReviewRequestV1 } from "../../src/review/review-request";
import { fallbackReviewRequestEstimator } from "../../src/review/review-budget";
import {
  ReviewTimeoutError,
  runReview,
} from "../../src/use-cases/run-review";

const config = Layer.succeed(ConfigService, {
  load: (overrides) => Effect.succeed(resolveReviewConfig(undefined, overrides)),
});
const services = Layer.merge(config, fakeReviewEngine);
const gitTextFile = (
  path: string,
  source: "staged" | "working-tree" | "untracked",
  patch: string,
) => {
  const header = patch.split("\n", 1)[0] ?? "";

  return {
    kind: "text" as const,
    path,
    source,
    status: source === "untracked" ? "A" as const : "M" as const,
    patch,
    fileHeader: "",
    hunks: patch.length === 0 ? [] : [{
      header,
      oldStartLine: 0,
      oldLineCount: 0,
      newStartLine: 1,
      newLineCount: 1,
      patch,
    }],
  };
};

test("runReview rejects selections that cannot execute yet", async () => {
  const git = Layer.succeed(GitService, {
    readDiff: () => Effect.die("unsupported selections must fail before Git"),
  });

  const error = await runReview({
    scope: "working-tree",
    configOverrides: {
      engine: "openai",
      provider: "openai",
      model: "gpt-example",
    },
  }).pipe(
    Effect.provide(git),
    Effect.provide(services),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(
    new UnsupportedReviewSelectionError({
      engine: "openai",
      provider: "openai",
      model: "gpt-example",
    }),
  );
});

test("runReview applies the resolved timeout to Git diff work", async () => {
  const git = Layer.succeed(GitService, {
    readDiff: () => Effect.never,
  });

  const error = await runReview({
    scope: "working-tree",
    configOverrides: { timeoutMs: 1 },
  }).pipe(
    Effect.provide(git),
    Effect.provide(services),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(new ReviewTimeoutError({ timeoutMilliseconds: 1 }));
});

test("runReview applies the same resolved timeout to engine work", async () => {
  const git = Layer.succeed(GitService, {
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/example.ts",
            "working-tree",
            "@@ -0,0 +1 @@\n+export const example = true;\n",
          ),
        ],
      }),
  });
  const engine = Layer.succeed(ReviewEngine, {
    review: () => Effect.never,
  });

  const error = await runReview({
    scope: "working-tree",
    configOverrides: { timeoutMs: 1 },
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(new ReviewTimeoutError({ timeoutMilliseconds: 1 }));
});

test("runReview builds the normalized request before invoking the engine", async () => {
  const requestFile = {
    path: "src/example.ts",
    source: "working-tree" as const,
    patch: "@@ -0,0 +1 @@\n+export const example = true;\n",
  };
  const file = gitTextFile(
    requestFile.path,
    requestFile.source,
    requestFile.patch,
  );
  const git = Layer.succeed(GitService, {
    readDiff: () => Effect.succeed({ files: [file] }),
  });
  let received: ReviewRequestV1 | undefined;
  const engine = Layer.succeed(ReviewEngine, {
    review: (request) =>
      Effect.sync(() => {
        received = request;
        return [];
      }),
  });

  await runReview({
    scope: "working-tree",
    configOverrides: {
      profile: "quick",
      model: "fake-reviewer-v1",
      concurrency: 1,
    },
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.runPromise,
  );

  expect(received).toMatchObject({
    schemaVersion: 1,
    context: {
      contentType: "untrusted-repository-data",
      repository: { scope: "working-tree" },
      files: [requestFile],
    },
    options: {
      profile: "quick",
      model: "fake-reviewer-v1",
      concurrency: 1,
    },
  });
});

test("runReview produces deterministic findings from added marker lines", async () => {
  const git = Layer.succeed(GitService, {
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/example.ts",
            "working-tree",
            [
              "@@ -2,2 +2,3 @@",
              " context",
              "+const marker = 'REVIEWSTUFF_FAKE_FINDING';",
              " context",
            ].join("\n"),
          ),
        ],
      }),
  });
  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(git),
    Effect.provide(services),
    Effect.runPromise,
  );

  expect(report).toMatchObject({
    schemaVersion: 4,
    scope: "working-tree",
    summary: {
      changedFiles: 1,
      reviewedFiles: 1,
      truncatedFiles: 0,
      skippedFiles: 0,
      findings: 1,
    },
    coverage: {
      schemaVersion: 2,
      complete: true,
      files: [
        {
          path: "src/example.ts",
          source: "working-tree",
          status: "reviewed",
          selectedHunks: 1,
          totalHunks: 1,
        },
      ],
    },
    findings: [
      {
        id: "fake-marker:src/example.ts:3:2c4700fe",
        ruleId: "fake-marker",
        severity: "medium",
        category: "correctness",
        confidence: 1,
        message: "Deterministic fake finding marker detected.",
        file: "src/example.ts",
        line: 3,
      },
    ],
  });
  expect(report.budget).toMatchObject({
    schemaVersion: 1,
    unit: "tokens",
    maxTokens: 128_000,
    outputReserveTokens: 16_384,
    fitsBudget: true,
  });
});

test("finding IDs do not change when the same patch is staged", async () => {
  const review = (source: "staged" | "working-tree") =>
    runReview({ scope: "working-tree" }).pipe(
      Effect.provide(
        Layer.succeed(GitService, {
          readDiff: () =>
            Effect.succeed({
              files: [
                gitTextFile(
                  "src/example.ts",
                  source,
                  "@@ -0,0 +1 @@\n+// REVIEWSTUFF_FAKE_FINDING stable\n",
                ),
              ],
            }),
        }),
      ),
      Effect.provide(services),
      Effect.map((report) => report.findings[0]?.id),
      Effect.runPromise,
    );

  expect(await review("working-tree")).toBe(await review("staged"));
});

test("runReview reports deterministic incomplete coverage", async () => {
  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(
      Layer.succeed(GitService, {
        readDiff: () =>
          Effect.succeed({
            files: [
              gitTextFile(
                "src/reviewed.ts",
                "working-tree",
                "@@ -0,0 +1 @@\n+export const reviewed = true;\n",
              ),
              {
                kind: "binary" as const,
                path: "assets/image.dat",
                source: "untracked" as const,
                status: "A" as const,
              },
            ],
          }),
      }),
    ),
    Effect.provide(services),
    Effect.runPromise,
  );

  expect(report.summary).toEqual({
    changedFiles: 2,
    reviewedFiles: 1,
    truncatedFiles: 0,
    skippedFiles: 1,
    findings: 0,
  });
  expect(report.coverage).toEqual({
    schemaVersion: 2,
    complete: false,
    files: [
      {
        path: "assets/image.dat",
        source: "untracked",
        reason: "binary",
        status: "skipped",
      },
      {
        path: "src/reviewed.ts",
        source: "working-tree",
        status: "reviewed",
        selectedHunks: 1,
        totalHunks: 1,
      },
    ],
  });
});

test("runReview sends only budget-selected hunks and reports the same coverage", async () => {
  const smallHunk = "@@ -0,0 +1 @@\n+small\n";
  const secondSmallHunk = "@@ -2,0 +3 @@\n+second\n";
  const hugeHunk = `@@ -0,0 +1 @@\n+${"x".repeat(2_000)}\n`;
  const partial = gitTextFile(
    "b-partial.ts",
    "working-tree",
    `${smallHunk}${hugeHunk}`,
  );
  partial.hunks = [
    { ...partial.hunks[0]!, patch: smallHunk },
    { ...partial.hunks[0]!, header: hugeHunk.split("\n", 1)[0]!, patch: hugeHunk },
  ];
  const git = Layer.succeed(GitService, {
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile("a-oversized.ts", "working-tree", hugeHunk),
          partial,
          gitTextFile("c-reviewed.ts", "working-tree", secondSmallHunk),
          {
            kind: "binary" as const,
            path: "image.dat",
            source: "untracked" as const,
            status: "A" as const,
          },
        ],
      }),
  });
  let received: ReviewRequestV1 | undefined;
  const engine = Layer.succeed(ReviewEngine, {
    review: (request) =>
      Effect.sync(() => {
        received = request;
        return [];
      }),
  });

  const report = await runReview({
    scope: "working-tree",
    configOverrides: {
      requestBudget: {
        maxTokens: 1_800,
        fixedRequestOverheadTokens: 0,
        outputReserveTokens: 100,
      },
    },
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.runPromise,
  );

  expect(received?.context.files).toEqual([
    {
      path: "b-partial.ts",
      source: "working-tree",
      patch: smallHunk,
    },
    {
      path: "c-reviewed.ts",
      source: "working-tree",
      patch: secondSmallHunk,
    },
  ]);
  expect(report.summary).toEqual({
    changedFiles: 4,
    reviewedFiles: 1,
    truncatedFiles: 1,
    skippedFiles: 2,
    findings: 0,
  });
  expect(
    report.coverage.files.map(({ path, status }) => ({ path, status })),
  ).toEqual([
    { path: "a-oversized.ts", status: "skipped" },
    { path: "b-partial.ts", status: "truncated" },
    { path: "c-reviewed.ts", status: "reviewed" },
    { path: "image.dat", status: "skipped" },
  ]);
  expect(new Set(report.coverage.files.map(({ path, source }) =>
    `${source}\0${path}`
  )).size).toBe(4);
  expect(received).toBeDefined();
  const requestTokens = fallbackReviewRequestEstimator.estimate(
    JSON.stringify(received),
  );
  expect(requestTokens + report.budget.outputReserveTokens).toBeLessThanOrEqual(
    report.budget.maxTokens,
  );
  expect(report.budget.selectedRequestTokens).toBe(
    fallbackReviewRequestEstimator.estimate(
      JSON.stringify(received?.context.files),
    ),
  );
  expect(report.budget.totalReservedTokens).toBe(
    report.budget.fixedRequestOverheadTokens +
      report.budget.outputReserveTokens +
      report.budget.selectedRequestTokens,
  );
});

test("runReview skips the engine when no hunk fits the request budget", async () => {
  const hugeHunk = `@@ -0,0 +1 @@\n+${"x".repeat(4_000)}\n`;
  let engineCalls = 0;
  const report = await runReview({
    scope: "staged",
    configOverrides: {
      requestBudget: {
        maxTokens: 1_000,
        fixedRequestOverheadTokens: 0,
        outputReserveTokens: 100,
      },
    },
  }).pipe(
    Effect.provide(
      Layer.succeed(GitService, {
        readDiff: () =>
          Effect.succeed({
            files: [gitTextFile("oversized.ts", "staged", hugeHunk)],
          }),
      }),
    ),
    Effect.provide(config),
    Effect.provide(
      Layer.succeed(ReviewEngine, {
        review: () =>
          Effect.sync(() => {
            engineCalls += 1;
            return [];
          }),
      }),
    ),
    Effect.runPromise,
  );

  expect(engineCalls).toBe(0);
  expect(report.coverage.files).toEqual([{
    path: "oversized.ts",
    source: "staged",
    status: "skipped",
    reason: "request-budget",
    selectedHunks: 0,
    totalHunks: 1,
  }]);
  expect(report.budget.fitsBudget).toBe(true);
  expect(report.budget.totalReservedTokens).toBe(
    report.budget.fixedRequestOverheadTokens +
      report.budget.outputReserveTokens +
      report.budget.selectedRequestTokens,
  );
  expect(report.findings).toEqual([]);
});

test("runReview sends metadata-only files to the engine", async () => {
  let engineCalls = 0;
  let received: ReviewRequestV1 | undefined;
  const metadataOnly = gitTextFile("empty.ts", "untracked", "");

  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(
      Layer.succeed(GitService, {
        readDiff: () => Effect.succeed({ files: [metadataOnly] }),
      }),
    ),
    Effect.provide(config),
    Effect.provide(
      Layer.succeed(ReviewEngine, {
        review: (request) =>
          Effect.sync(() => {
            engineCalls += 1;
            received = request;
            return [];
          }),
      }),
    ),
    Effect.runPromise,
  );

  expect(engineCalls).toBe(1);
  expect(received?.context.files).toEqual([{
    path: "empty.ts",
    source: "untracked",
    patch: "",
  }]);
  expect(report.coverage.files).toEqual([{
    path: "empty.ts",
    source: "untracked",
    status: "reviewed",
    selectedHunks: 0,
    totalHunks: 0,
  }]);
  expect(report.findings).toEqual([]);
});

test("runReview propagates typed engine failures", async () => {
  const failure = new ReviewEngineFailure({
    message: "Injected engine failure.",
    cause: undefined,
  });
  const git = Layer.succeed(GitService, {
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/example.ts",
            "working-tree",
            "@@ -0,0 +1 @@\n+export const example = true;\n",
          ),
        ],
      }),
  });
  const engine = Layer.succeed(ReviewEngine, {
    review: () => Effect.fail(failure),
  });

  const error = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toBe(failure);
});
