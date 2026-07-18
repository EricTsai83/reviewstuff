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
) => ({
  kind: "text" as const,
  path,
  source,
  status: source === "untracked" ? "A" as const : "M" as const,
  patch,
  fileHeader: "",
  hunks: [],
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

  const error = await runReview("working-tree", { timeoutMs: 1 }).pipe(
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

  const error = await runReview("working-tree", { timeoutMs: 1 }).pipe(
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

  await runReview("working-tree", {
    profile: "quick",
    model: "fake-reviewer-v1",
    concurrency: 1,
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
  const report = await runReview("working-tree").pipe(
    Effect.provide(git),
    Effect.provide(services),
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
  const report = await runReview("working-tree").pipe(
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
    skippedFiles: 1,
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
        path: "src/reviewed.ts",
        source: "working-tree",
        status: "reviewed",
      },
    ],
  });
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

  const error = await runReview("working-tree").pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toBe(failure);
});
