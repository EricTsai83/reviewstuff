import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  decodeReviewFindingV1,
  type ReviewFindingV1,
} from "../domain/finding";
import type { ReviewTransport } from "../domain/privacy";
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

export class ReviewEngineAuthenticationError extends Data.TaggedError(
  "ReviewEngineAuthenticationError",
)<{
  readonly provider: string;
  readonly statusCode?: number;
}> {}

export class ReviewEngineConfigurationError extends Data.TaggedError(
  "ReviewEngineConfigurationError",
)<{
  readonly engine: string;
  readonly field: string;
  readonly message: string;
}> {}

export class ReviewEngineTransportError extends Data.TaggedError(
  "ReviewEngineTransportError",
)<{
  readonly provider: string;
  readonly statusCode?: number;
  /**
   * Provider-defined error identifiers copied from the response envelope. Only
   * these two fields are allowlisted: the response body itself stays in `cause`
   * and is never rendered or logged.
   */
  readonly errorType?: string;
  readonly errorCode?: string;
  readonly cause: unknown;
}> {}

/**
 * A provider response that exceeded the read limit. Only bounded counters are
 * kept: the body itself is never part of the error.
 */
export class ReviewEngineResponseTooLargeError extends Data.TaggedError(
  "ReviewEngineResponseTooLargeError",
)<{
  readonly provider: string;
  readonly maxBytes: number;
  readonly observedBytes: number;
}> {}

export class ReviewEngineTimeoutError extends Data.TaggedError(
  "ReviewEngineTimeoutError",
)<{
  readonly provider: string;
  readonly timeoutMilliseconds: number;
}> {}

export class ReviewEngineRefusalError extends Data.TaggedError(
  "ReviewEngineRefusalError",
)<{
  readonly provider: string;
}> {}

export type ReviewEngineIncompleteReason =
  | "max_output_tokens"
  | "content_filter"
  | "unknown";

export class ReviewEngineIncompleteError extends Data.TaggedError(
  "ReviewEngineIncompleteError",
)<{
  readonly provider: string;
  readonly reason: ReviewEngineIncompleteReason;
}> {}

export class ReviewEngineEmptyOutputError extends Data.TaggedError(
  "ReviewEngineEmptyOutputError",
)<{
  readonly provider: string;
}> {}

export type ReviewEngineInvalidOutputStage =
  | "response"
  | "message"
  | "findings";

export class ReviewEngineInvalidOutputError extends Data.TaggedError(
  "ReviewEngineInvalidOutputError",
)<{
  readonly provider: string;
  readonly stage: ReviewEngineInvalidOutputStage;
  readonly cause: unknown;
}> {}

export type ReviewEngineError =
  | ReviewEngineFailure
  | ReviewEngineAuthenticationError
  | ReviewEngineConfigurationError
  | ReviewEngineTransportError
  | ReviewEngineResponseTooLargeError
  | ReviewEngineTimeoutError
  | ReviewEngineRefusalError
  | ReviewEngineIncompleteError
  | ReviewEngineEmptyOutputError
  | ReviewEngineInvalidOutputError;

/** Local execution knobs resolved from config; deliberately kept out of the
 * serialized request contract so budgeting measures only reviewable data. */
export interface ReviewEngineExecution {
  readonly concurrency: number;
  readonly timeoutMilliseconds: number;
  readonly maxOutputTokens: number;
}

export class ReviewEngine extends Context.Service<
  ReviewEngine,
  {
    /** Classifies whether invoking this engine keeps repository data on the
     * local machine or sends it to a remote service. */
    readonly transport: ReviewTransport;
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

export const make: ReviewEngine["Service"] = ReviewEngine.of({
  transport: "local",
  review,
});

export const layer: Layer.Layer<ReviewEngine> = Layer.succeed(
  ReviewEngine,
  make,
);
