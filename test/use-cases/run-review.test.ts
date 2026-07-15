import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { GitService } from "../../src/git/git-service";
import { runReview } from "../../src/use-cases/run-review";

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
      }),
  });
  const report = await runReview("working-tree").pipe(
    Effect.provide(git),
    Effect.runPromise,
  );

  expect(report).toEqual({
    schemaVersion: 1,
    scope: "working-tree",
    summary: { changedFiles: 1, findings: 1 },
    findings: [
      {
        id: "fake-marker:src/example.ts:3:2c4700fe",
        ruleId: "fake-marker",
        severity: "warning",
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
            }),
        }),
      ),
      Effect.map((report) => report.findings[0]?.id),
      Effect.runPromise,
    );

  expect(await review("working-tree")).toBe(await review("staged"));
});
