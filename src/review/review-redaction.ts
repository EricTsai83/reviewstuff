import * as Schema from "effect/Schema";
import {
  type ReviewRequestV1,
  ReviewRequestV1Schema,
} from "./review-request";
import {
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "../shared/schema-primitives";

export const ReviewRedactionReasonSchema = Schema.Union([
  Schema.Literal("api-key"),
  Schema.Literal("private-key"),
  Schema.Literal("high-entropy-token"),
]);

const ReviewRedactionReasonCountV1Schema = Schema.Struct({
  reason: ReviewRedactionReasonSchema,
  count: PositiveIntegerSchema,
});

export const ReviewRedactionSummaryV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  totalRedactions: NonNegativeIntegerSchema,
  reasons: Schema.Array(ReviewRedactionReasonCountV1Schema),
});

export const RedactedReviewRequestV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  request: ReviewRequestV1Schema,
  redaction: ReviewRedactionSummaryV1Schema,
});

export type ReviewRedactionReason =
  typeof ReviewRedactionReasonSchema.Type;
export type ReviewRedactionSummaryV1 =
  typeof ReviewRedactionSummaryV1Schema.Type;
export type RedactedReviewRequestV1 =
  typeof RedactedReviewRequestV1Schema.Type;

export const reviewRedactionTokens: Readonly<
  Record<ReviewRedactionReason, string>
> = {
  "api-key": "[REDACTED:api-key]",
  "private-key": "[REDACTED:private-key]",
  "high-entropy-token": "[REDACTED:high-entropy-token]",
};

const redactionReasonOrder: ReadonlyArray<ReviewRedactionReason> = [
  "api-key",
  "private-key",
  "high-entropy-token",
];

const apiKeyPattern =
  /(?:\bsk-[A-Za-z0-9_-]{16,256}\b|\bgh[pousr]_[A-Za-z0-9]{20,255}\b|\bglpat-[A-Za-z0-9_-]{20,255}\b|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bxox[baprs]-[A-Za-z0-9-]{10,255}\b)/gu;
const hexadecimalPattern = /^[0-9a-f]+$/iu;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const privateKeyLabelPattern =
  "(?:PRIVATE KEY|ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|DSA PRIVATE KEY|OPENSSH PRIVATE KEY|PGP PRIVATE KEY BLOCK)";
const privateKeyBeginPattern = new RegExp(
  `^([ +-]?)[\\t ]*-----BEGIN (${privateKeyLabelPattern})-----[\\t ]*$`,
  "u",
);
const privateKeyEndPattern = new RegExp(
  `^[ +-]?[\\t ]*-----END (${privateKeyLabelPattern})-----[\\t ]*$`,
  "u",
);
const maximumPrivateKeyBlockLines = 256;
const maximumPrivateKeyBlockCharacters = 64 * 1024;
const minimumHighEntropyTokenCharacters = 32;
const maximumHighEntropyTokenCharacters = 4_096;

const shannonEntropy = (value: string): number => {
  const frequencies = new Map<string, number>();

  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  let entropy = 0;
  for (const frequency of frequencies.values()) {
    const probability = frequency / value.length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
};

const isHighEntropyToken = (value: string): boolean => {
  if (hexadecimalPattern.test(value) || uuidPattern.test(value)) {
    return false;
  }

  const hasLowercase = /[a-z]/u.test(value);
  const hasUppercase = /[A-Z]/u.test(value);
  const hasDigit = /[0-9]/u.test(value);
  const hasTokenSymbol = /[+/_=-]/u.test(value);

  return hasLowercase &&
    hasUppercase &&
    hasDigit &&
    hasTokenSymbol &&
    shannonEntropy(value) >= 4.2;
};

const isAsciiLetterOrDigit = (character: string): boolean => {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }

  return (codePoint >= 48 && codePoint <= 57) ||
    (codePoint >= 65 && codePoint <= 90) ||
    (codePoint >= 97 && codePoint <= 122);
};

const isHighEntropyTokenCharacter = (character: string): boolean =>
  isAsciiLetterOrDigit(character) ||
  character === "+" ||
  character === "/" ||
  character === "_" ||
  character === "=" ||
  character === "-";

const redactHighEntropyTokens = (
  value: string,
  counts: Record<ReviewRedactionReason, number>,
): string => {
  const chunks: Array<string> = [];
  let unchangedStart = 0;
  let index = 0;

  while (index < value.length) {
    if (!isAsciiLetterOrDigit(value[index] ?? "")) {
      index += 1;
      continue;
    }

    const candidateStart = index;
    index += 1;
    while (
      index < value.length &&
      isHighEntropyTokenCharacter(value[index] ?? "")
    ) {
      index += 1;
    }

    const candidateLength = index - candidateStart;
    if (candidateLength < minimumHighEntropyTokenCharacters) {
      continue;
    }

    const shouldRedact = candidateLength > maximumHighEntropyTokenCharacters ||
      isHighEntropyToken(value.slice(candidateStart, index));
    if (!shouldRedact) {
      continue;
    }

    chunks.push(
      value.slice(unchangedStart, candidateStart),
      reviewRedactionTokens["high-entropy-token"],
    );
    unchangedStart = index;
    counts["high-entropy-token"] += 1;
  }

  if (chunks.length === 0) {
    return value;
  }

  chunks.push(value.slice(unchangedStart));
  return chunks.join("");
};

const redactPrivateKeyBlocks = (
  value: string,
  counts: Record<ReviewRedactionReason, number>,
): string => {
  const parts = value.split(/(\r\n|\r|\n)/u);

  for (let partIndex = 0; partIndex < parts.length; partIndex += 2) {
    const line = parts[partIndex] ?? "";
    const begin = privateKeyBeginPattern.exec(line);
    if (begin === null) {
      continue;
    }

    const diffPrefix = begin[1] ?? "";
    const label = begin[2];
    let candidateCharacters = line.length;
    let endPartIndex: number | undefined;

    for (
      let candidatePartIndex = partIndex + 2, candidateLines = 2;
      candidatePartIndex < parts.length &&
      candidateLines <= maximumPrivateKeyBlockLines;
      candidatePartIndex += 2, candidateLines += 1
    ) {
      const candidateLine = parts[candidatePartIndex] ?? "";
      const lineBreak = parts[candidatePartIndex - 1] ?? "";
      candidateCharacters += lineBreak.length + candidateLine.length;
      if (candidateCharacters > maximumPrivateKeyBlockCharacters) {
        break;
      }

      const end = privateKeyEndPattern.exec(candidateLine);
      if (end?.[1] === label) {
        endPartIndex = candidatePartIndex;
        break;
      }
    }

    if (endPartIndex === undefined) {
      continue;
    }

    for (
      let redactedPartIndex = partIndex;
      redactedPartIndex <= endPartIndex;
      redactedPartIndex += 2
    ) {
      const redactedLine = parts[redactedPartIndex] ?? "";
      const preservedPrefix =
        diffPrefix.length > 0 && redactedLine.startsWith(diffPrefix)
          ? diffPrefix
          : "";
      parts[redactedPartIndex] = redactedPartIndex === partIndex
        ? preservedPrefix + reviewRedactionTokens["private-key"]
        : preservedPrefix;
    }

    counts["private-key"] += 1;
    partIndex = endPartIndex;
  }

  return parts.join("");
};

const redactString = (
  value: string,
  counts: Record<ReviewRedactionReason, number>,
): string => {
  const withoutPrivateKeys = redactPrivateKeyBlocks(value, counts);
  const withoutApiKeys = withoutPrivateKeys.replace(apiKeyPattern, () => {
    counts["api-key"] += 1;
    return reviewRedactionTokens["api-key"];
  });

  return redactHighEntropyTokens(withoutApiKeys, counts);
};

const redactRequestTree = (
  value: unknown,
  counts: Record<ReviewRedactionReason, number>,
): unknown => {
  if (typeof value === "string") {
    return redactString(value, counts);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactRequestTree(item, counts));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactRequestTree(item, counts),
      ]),
    );
  }

  return value;
};

const validateRedactedReviewRequestV1 = (
  result: RedactedReviewRequestV1,
): RedactedReviewRequestV1 => {
  const reasons = new Set<ReviewRedactionReason>();
  let totalRedactions = 0;

  for (const item of result.redaction.reasons) {
    if (reasons.has(item.reason)) {
      throw new Error("Invalid redaction summary: duplicate reason");
    }

    reasons.add(item.reason);
    totalRedactions += item.count;
  }

  if (totalRedactions !== result.redaction.totalRedactions) {
    throw new Error("Invalid redaction summary: total does not match reasons");
  }

  return result;
};

export const decodeRedactedReviewRequestV1 = (
  input: unknown,
): RedactedReviewRequestV1 =>
  validateRedactedReviewRequestV1(
    Schema.decodeUnknownSync(RedactedReviewRequestV1Schema)(input, {
      onExcessProperty: "error",
    }),
  );

export const redactReviewRequestV1 = (
  request: ReviewRequestV1,
): RedactedReviewRequestV1 => {
  const counts: Record<ReviewRedactionReason, number> = {
    "api-key": 0,
    "private-key": 0,
    "high-entropy-token": 0,
  };
  const redactedRequest = redactRequestTree(request, counts);
  const reasons = redactionReasonOrder.flatMap((reason) =>
    counts[reason] === 0 ? [] : [{ reason, count: counts[reason] }]
  );

  return decodeRedactedReviewRequestV1({
    schemaVersion: 1,
    request: redactedRequest,
    redaction: {
      schemaVersion: 1,
      totalRedactions: reasons.reduce(
        (total, item) => total + item.count,
        0,
      ),
      reasons,
    },
  });
};
