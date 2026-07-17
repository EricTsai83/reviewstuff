import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  decodeReviewFindingV1,
  type ReviewFindingV1,
} from "../domain/finding";

export interface ReviewEngineFile {
  readonly path: string;
  readonly patch: string;
}

export interface ReviewEngineRequest {
  readonly files: ReadonlyArray<ReviewEngineFile>;
  readonly concurrency: number;
}

export class ReviewEngineFailure extends Data.TaggedError(
  "ReviewEngineFailure",
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export type ReviewEngineError = ReviewEngineFailure;

export class ReviewEngine extends Context.Service<
  ReviewEngine,
  {
    readonly review: (
      request: ReviewEngineRequest,
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
  file: ReviewEngineFile,
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
  request: ReviewEngineRequest,
): Effect.Effect<ReadonlyArray<ReviewFindingV1>, ReviewEngineError> =>
  Effect.forEach(
    request.files,
    (file) =>
      Effect.try({
        try: () => findingsForPatch(file),
        catch: (cause) =>
          new ReviewEngineFailure({
            message: "Fake review engine produced an invalid finding.",
            cause,
          }),
      }),
    { concurrency: request.concurrency },
  ).pipe(Effect.map((fileFindings) => fileFindings.flat()));

export const layer: Layer.Layer<ReviewEngine> = Layer.succeed(
  ReviewEngine,
  { review },
);
