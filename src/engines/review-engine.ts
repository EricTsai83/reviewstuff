import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  decodeReviewFindingV1,
  type ReviewFindingV1,
} from "../domain/finding";
import type {
  ReviewRequestFileV1,
  ReviewRequestV1,
} from "../review/review-request";

export class ReviewEngineFailure extends Data.TaggedError(
  "ReviewEngineFailure",
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export type ReviewEngineError = ReviewEngineFailure;

/** Local execution knobs resolved from config; deliberately kept out of the
 * serialized request contract so budgeting measures only reviewable data. */
export interface ReviewEngineExecution {
  readonly concurrency: number;
}

export class ReviewEngine extends Context.Service<
  ReviewEngine,
  {
    /** Reviews the exact normalized request. Budgeting and truncation are
     * upstream policy decisions; engines must not silently truncate it. */
    readonly review: (
      request: ReviewRequestV1,
      execution: ReviewEngineExecution,
    ) => Effect.Effect<ReadonlyArray<ReviewFindingV1>, ReviewEngineError>;
  }
>()("reviewstuff/ReviewEngine") {}

const fakeFindingMarker = "REVIEWSTUFF_FAKE_FINDING";

// Finding IDs are compatibility-sensitive deterministic identities. This is
// intentionally not a cryptographic hash and must never be used for security.
const stableFindingFingerprint = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const findingsForPatch = (
  file: ReviewRequestFileV1,
): ReadonlyArray<ReviewFindingV1> => {
  const findings: Array<ReviewFindingV1> = [];
  let targetLineNumber = 0;

  for (const line of file.patch.split("\n")) {
    const hunkHeaderMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(
      line,
    );

    if (hunkHeaderMatch !== null) {
      targetLineNumber = Number(hunkHeaderMatch[1]);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (line.includes(fakeFindingMarker)) {
        findings.push(decodeReviewFindingV1({
          id: `fake-marker:${file.path}:${targetLineNumber}:${stableFindingFingerprint(line.slice(1))}`,
          ruleId: "fake-marker",
          severity: "medium",
          category: "correctness",
          confidence: 1,
          message: "Deterministic fake finding marker detected.",
          file: file.path,
          line: targetLineNumber,
        }));
      }

      targetLineNumber += 1;
      continue;
    }

    if (!line.startsWith("-") && !line.startsWith("\\")) {
      targetLineNumber += 1;
    }
  }

  return findings;
};

const review = (
  request: ReviewRequestV1,
  execution: ReviewEngineExecution,
): Effect.Effect<ReadonlyArray<ReviewFindingV1>, ReviewEngineError> =>
  Effect.forEach(
    request.context.files,
    (file) =>
      Effect.try({
        try: () => findingsForPatch(file),
        catch: (cause) =>
          new ReviewEngineFailure({
            message: "Fake review engine produced an invalid finding.",
            cause,
          }),
      }),
    { concurrency: execution.concurrency },
  ).pipe(Effect.map((fileFindings) => fileFindings.flat()));

export const make: ReviewEngine["Service"] = ReviewEngine.of({ review });

export const layer: Layer.Layer<ReviewEngine> = Layer.succeed(
  ReviewEngine,
  make,
);
