import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ConfigService,
  resolveReviewConfig,
  UnsupportedReviewSelectionError,
} from "../../src/config/config-service";
import { GitService } from "../../src/git/git-service";
import {
  ReviewTimeoutError,
  runReview,
} from "../../src/use-cases/run-review";

const config = Layer.succeed(ConfigService, {
  load: (overrides) => Effect.succeed(resolveReviewConfig(undefined, overrides)),
});

test("runReview rejects selections that cannot execute yet", async () => {
  const git = Layer.succeed(GitService, {
    readDiff: () => Effect.die("unsupported selections must fail before Git"),
  });

  const error = await runReview("working-tree", {
    engine: "openai",
    provider: "openai",
    model: "gpt-example",
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
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

test("runReview applies the resolved timeout to review work", async () => {
  const git = Layer.succeed(GitService, {
    readDiff: () => Effect.never,
  });

  const error = await runReview("working-tree", { timeoutMs: 1 }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(new ReviewTimeoutError({ timeoutMilliseconds: 1 }));
});

test("runReview produces deterministic findings from added marker lines", async () => {
  const git = Layer.succeed(GitService, {
    readDiff: () =>
      Effect.succeed({
        files: [
          {
            path: "src/example.ts",
            source: "working-tree" as const,
            patch: [
              "@@ -2,2 +2,3 @@",
              " context",
              "+const marker = 'REVIEWSTUFF_FAKE_FINDING';",
              " context",
            ].join("\n"),
          },
        ],
        skippedFiles: [],
      }),
  });
  const report = await runReview("working-tree").pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.runPromise,
  );

  expect(report).toEqual({
    schemaVersion: 3,
    scope: "working-tree",
    summary: {
      changedFiles: 1,
      reviewedFiles: 1,
      skippedFiles: 0,
      findings: 1,
    },
    coverage: {
      schemaVersion: 1,
      complete: true,
      files: [
        {
          path: "src/example.ts",
          source: "working-tree",
          status: "reviewed",
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
});

test("finding IDs do not change when the same patch is staged", async () => {
  const review = (source: "staged" | "working-tree") =>
    runReview("working-tree").pipe(
      Effect.provide(
        Layer.succeed(GitService, {
          readDiff: () =>
            Effect.succeed({
              files: [
                {
                  path: "src/example.ts",
                  source,
                  patch:
                    "@@ -0,0 +1 @@\n+// REVIEWSTUFF_FAKE_FINDING stable\n",
                },
              ],
              skippedFiles: [],
            }),
        }),
      ),
      Effect.provide(config),
      Effect.map((report) => report.findings[0]?.id),
      Effect.runPromise,
    );

  expect(await review("working-tree")).toBe(await review("staged"));
});

test("runReview reports deterministic incomplete coverage", async () => {
  const report = await runReview("working-tree").pipe(
    Effect.provide(
      Layer.succeed(GitService, {
        readDiff: () =>
          Effect.succeed({
            files: [
              {
                path: "src/reviewed.ts",
                source: "working-tree" as const,
                patch: "@@ -0,0 +1 @@\n+export const reviewed = true;\n",
              },
            ],
            skippedFiles: [
              {
                path: "assets/image.dat",
                source: "untracked" as const,
                reason: "binary" as const,
              },
              {
                path: "fixtures/large.json",
                source: "working-tree" as const,
                reason: "file-too-large" as const,
                sizeBytes: "600000",
                limitBytes: 524288,
              },
            ],
          }),
      }),
    ),
    Effect.provide(config),
    Effect.runPromise,
  );

  expect(report.summary).toEqual({
    changedFiles: 3,
    reviewedFiles: 1,
    skippedFiles: 2,
    findings: 0,
  });
  expect(report.coverage).toEqual({
    schemaVersion: 1,
    complete: false,
    files: [
      {
        path: "assets/image.dat",
        source: "untracked",
        reason: "binary",
        status: "skipped",
      },
      {
        path: "fixtures/large.json",
        source: "working-tree",
        reason: "file-too-large",
        sizeBytes: "600000",
        limitBytes: 524288,
        status: "skipped",
      },
      {
        path: "src/reviewed.ts",
        source: "working-tree",
        status: "reviewed",
      },
    ],
  });
});
