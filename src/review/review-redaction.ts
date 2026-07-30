import * as Schema from "effect/Schema";
import type { ReviewBudgetFile } from "./review-budget";
import {
  type ReviewRequestV1,
  ReviewRequestV1Schema,
} from "./review-request";
import {
  ReviewRedactionSummaryV1Schema,
  validateReviewRedactionSummary,
  type ReviewRedactionReason,
  type ReviewRedactionSummaryV1,
} from "../domain/redaction";

export const RedactedReviewRequestV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  request: ReviewRequestV1Schema,
  redaction: ReviewRedactionSummaryV1Schema,
});

export type {
  ReviewRedactionReason,
  ReviewRedactionSummaryV1,
} from "../domain/redaction";
export type RedactedReviewRequestV1 =
  typeof RedactedReviewRequestV1Schema.Type;

export const reviewRedactionTokens: Readonly<
  Record<ReviewRedactionReason, string>
> = {
  "api-key": "[REDACTED:api-key]",
  "private-key": "[REDACTED:private-key]",
  "high-entropy-token": "[REDACTED:high-entropy-token]",
};

/**
 * Git classifies files containing NUL as binary, so these placeholders cannot
 * collide with the text-file content accepted by the review pipeline. They are
 * intentionally longer than the public tokens to keep pre-selection budgeting
 * conservative.
 */
const preSelectionRedactionTokens: Readonly<
  Record<ReviewRedactionReason, string>
> = {
  "api-key": "\0reviewstuff-redacted:api-key\0",
  "private-key": "\0reviewstuff-redacted:private-key\0",
  "high-entropy-token": "\0reviewstuff-redacted:high-entropy-token\0",
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
/**
 * Not anchored to a whole line: a key is just as dangerous inside a string
 * literal, which is how test files and config generators usually carry one.
 */
const privateKeyBeginPattern = new RegExp(
  `-----BEGIN (${privateKeyLabelPattern})-----`,
  "u",
);
const minimumHighEntropyTokenCharacters = 32;
const maximumHighEntropyTokenCharacters = 4_096;
/**
 * A token this long is treated as opaque even when it uses one character class,
 * which is how roughly a quarter of AWS secret access keys look.
 */
const singleClassHighEntropyTokenCharacters = 40;
const mixedClassEntropyThreshold = 4.2;
/**
 * Measured against the documented false positives: run-on identifiers such as
 * `ThisIsAVeryLongIdentifierWithVersion12345` reach 4.29 bits and
 * `ReadonlyArrayOfReviewFileCoverageStatusItems` 4.30, while base64 secrets of
 * the same length start at 4.71. The threshold sits in that gap.
 */
const singleClassEntropyThreshold = 4.6;
/**
 * Subresource-integrity digests are public checksums, but the algorithm prefix
 * alone is not an allowlist: the digest must have canonical base64 shape and
 * the exact byte length for that algorithm.
 */
const integrityDigestPatterns: ReadonlyArray<RegExp> = [
  /^sha256-[A-Za-z0-9+/]{43}=$/u,
  /^sha384-[A-Za-z0-9+/]{64}$/u,
  /^sha512-[A-Za-z0-9+/]{86}==$/u,
];

const isIntegrityDigest = (value: string): boolean =>
  integrityDigestPatterns.some((pattern) => pattern.test(value));

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
  // Hexadecimal is excluded on purpose: 40-hex Git object names are everywhere
  // in reviewed code, and redacting them would hide ordinary content. UUIDs are
  // excluded for the same reason.
  if (hexadecimalPattern.test(value) || uuidPattern.test(value)) {
    return false;
  }

  if (isIntegrityDigest(value)) {
    return false;
  }

  const entropy = shannonEntropy(value);
  if (value.length >= singleClassHighEntropyTokenCharacters) {
    return entropy >= singleClassEntropyThreshold;
  }

  const hasLowercase = /[a-z]/u.test(value);
  const hasUppercase = /[A-Z]/u.test(value);
  const hasDigit = /[0-9]/u.test(value);
  const hasTokenSymbol = /[+/_=-]/u.test(value);

  return hasLowercase &&
    hasUppercase &&
    hasDigit &&
    hasTokenSymbol &&
    entropy >= mixedClassEntropyThreshold;
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
  tokens: Readonly<Record<ReviewRedactionReason, string>>,
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

    const candidate = value.slice(candidateStart, index);
    const shouldRedact = !isIntegrityDigest(candidate) &&
      (candidateLength > maximumHighEntropyTokenCharacters ||
        isHighEntropyToken(candidate));
    if (!shouldRedact) {
      continue;
    }

    chunks.push(
      value.slice(unchangedStart, candidateStart),
      tokens["high-entropy-token"],
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

/**
 * Returns the line's own diff prefix so redacting a block keeps the hunk's line
 * count and its per-line add/remove structure intact.
 */
const diffLinePrefix = (line: string): string =>
  line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")
    ? line.slice(0, 1)
    : "";

interface PrivateKeyRedactionState {
  label: string | undefined;
}

const isDiffStructuralLine = (line: string): boolean =>
  line.startsWith("@@ ") || line === "\\ No newline at end of file";

const redactPrivateKeyBlocks = (
  value: string,
  counts: Record<ReviewRedactionReason, number>,
  tokens: Readonly<Record<ReviewRedactionReason, string>>,
  state: PrivateKeyRedactionState,
): string => {
  const parts = value.split(/(\r\n|\r|\n)/u);

  for (let partIndex = 0; partIndex < parts.length; partIndex += 2) {
    const line = parts[partIndex] ?? "";

    if (state.label !== undefined) {
      if (isDiffStructuralLine(line)) {
        continue;
      }

      const endMarker = `-----END ${state.label}-----`;
      const endIndex = line.indexOf(endMarker);
      if (endIndex === -1) {
        parts[partIndex] = diffLinePrefix(line);
        continue;
      }

      parts[partIndex] = `${diffLinePrefix(line)}${
        line.slice(endIndex + endMarker.length)
      }`;
      state.label = undefined;
      continue;
    }

    const begin = privateKeyBeginPattern.exec(line);
    if (begin === null) {
      continue;
    }

    const label = begin[1];
    if (label === undefined) {
      continue;
    }

    const beginIndex = begin.index;
    // Text before the marker is not key material, so an embedding string
    // literal still reads sensibly after redaction.
    const head = line.slice(0, beginIndex);
    const endMarker = `-----END ${label}-----`;
    const endIndex = line.indexOf(
      endMarker,
      beginIndex + begin[0].length,
    );
    const tail = endIndex === -1
      ? ""
      : line.slice(endIndex + endMarker.length);
    parts[partIndex] = `${head}${tokens["private-key"]}${tail}`;

    counts["private-key"] += 1;
    state.label = endIndex === -1 ? label : undefined;
  }

  return parts.join("");
};

const redactString = (
  value: string,
  counts: Record<ReviewRedactionReason, number>,
  tokens: Readonly<Record<ReviewRedactionReason, string>> =
    reviewRedactionTokens,
  privateKeyState: PrivateKeyRedactionState = { label: undefined },
): string => {
  const withoutPrivateKeys = redactPrivateKeyBlocks(
    value,
    counts,
    tokens,
    privateKeyState,
  );
  const withoutApiKeys = withoutPrivateKeys.replace(apiKeyPattern, () => {
    counts["api-key"] += 1;
    return tokens["api-key"];
  });

  return redactHighEntropyTokens(withoutApiKeys, counts, tokens);
};

const restorePreSelectionRedactions = (
  value: string,
  counts: Record<ReviewRedactionReason, number>,
): string => {
  let restored = value;

  for (const reason of redactionReasonOrder) {
    restored = restored.replaceAll(preSelectionRedactionTokens[reason], () => {
      counts[reason] += 1;
      return reviewRedactionTokens[reason];
    });
  }

  return restored;
};

const redactRequestTree = (
  value: unknown,
  counts: Record<ReviewRedactionReason, number>,
): unknown => {
  if (typeof value === "string") {
    return redactString(restorePreSelectionRedactions(value, counts), counts);
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
  validateReviewRedactionSummary(result.redaction, (reason) => {
    throw new Error(`Invalid redaction summary: ${reason}`);
  });

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

const emptyRedactionCounts = (): Record<ReviewRedactionReason, number> => ({
  "api-key": 0,
  "private-key": 0,
  "high-entropy-token": 0,
});

const redactionSummary = (
  counts: Record<ReviewRedactionReason, number>,
): ReviewRedactionSummaryV1 => {
  const reasons = redactionReasonOrder.flatMap((reason) =>
    counts[reason] === 0 ? [] : [{ reason, count: counts[reason] }]
  );

  return {
    schemaVersion: 1,
    totalRedactions: reasons.reduce((total, item) => total + item.count, 0),
    reasons,
  };
};

/**
 * Redacts the file content the request budget will measure.
 *
 * Running before selection is what makes the budget invariant hold for the
 * payload that is actually sent. Paths stay untouched here because they feed
 * the local coverage report; the request-tree pass still redacts them on the
 * way out.
 */
export const redactReviewFileContents = (
  files: ReadonlyArray<ReviewBudgetFile>,
): ReadonlyArray<ReviewBudgetFile> => {
  const counts = emptyRedactionCounts();

  return files.map((file) => {
    const privateKeyState: PrivateKeyRedactionState = { label: undefined };

    return {
      path: file.path,
      source: file.source,
      fileHeader: redactString(
        file.fileHeader,
        counts,
        preSelectionRedactionTokens,
      ),
      hunks: file.hunks.map((hunk) => ({
        patch: redactString(
          hunk.patch,
          counts,
          preSelectionRedactionTokens,
          privateKeyState,
        ),
      })),
    };
  });
};

export const redactReviewRequestV1 = (
  request: ReviewRequestV1,
): RedactedReviewRequestV1 => {
  const counts: Record<ReviewRedactionReason, number> = emptyRedactionCounts();
  const redactedRequest = redactRequestTree(request, counts);

  return decodeRedactedReviewRequestV1({
    schemaVersion: 1,
    request: redactedRequest,
    redaction: redactionSummary(counts),
  });
};
