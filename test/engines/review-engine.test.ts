import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import type { ReviewFindingV1 } from "../../src/domain/finding";
import {
  layer,
  ReviewEngine,
  ReviewEngineFailure,
  type ReviewEngineRequest,
} from "../../src/engines/review-engine";

const review = (request: ReviewEngineRequest) =>
  ReviewEngine.pipe(
    Effect.flatMap((engine) => engine.review(request)),
    Effect.provide(layer),
    Effect.runPromise,
  );

test("fake ReviewEngine produces deterministic findings from added marker lines", async () => {
  const request: ReviewEngineRequest = {
    files: [
      {
        path: "src/example.ts",
        patch: [
          "@@ -2,2 +2,3 @@",
          " context",
          "+const marker = 'REVIEWSTUFF_FAKE_FINDING';",
          " context",
        ].join("\n"),
      },
    ],
    concurrency: 2,
  };
  const expected: ReadonlyArray<ReviewFindingV1> = [
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
  ];

  expect(await review(request)).toEqual(expected);
  expect(await review(request)).toEqual(expected);
});

test("fake ReviewEngine ignores markers outside added lines", async () => {
  expect(
    await review({
      files: [
        {
          path: "src/example.ts",
          patch: [
            "@@ -1,2 +1,2 @@",
            "-// REVIEWSTUFF_FAKE_FINDING removed",
            " // REVIEWSTUFF_FAKE_FINDING context",
          ].join("\n"),
        },
      ],
      concurrency: 1,
    }),
  ).toEqual([]);
});

test("fake ReviewEngine maps invalid generated findings to a typed failure", async () => {
  const error = await ReviewEngine.pipe(
    Effect.flatMap((engine) =>
      engine.review({
        files: [
          {
            path: "src/example.ts",
            patch: "+// REVIEWSTUFF_FAKE_FINDING missing-hunk",
          },
        ],
        concurrency: 1,
      }),
    ),
    Effect.provide(layer),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toBeInstanceOf(ReviewEngineFailure);
  expect(error.message).toBe(
    "Fake review engine produced an invalid finding.",
  );
});
