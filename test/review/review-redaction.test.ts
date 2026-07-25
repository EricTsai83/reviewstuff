import { expect, test } from "bun:test";
import {
  decodeRedactedReviewRequestV1,
  redactReviewRequestV1,
  reviewRedactionTokens,
  type ReviewRedactionReason,
} from "../../src/review/review-redaction";
import {
  buildReviewRequestV1,
  decodeReviewRequestV1,
} from "../../src/review/review-request";

interface RedactionFixture {
  readonly secrets: ReadonlyArray<{
    readonly reason: ReviewRedactionReason;
    readonly value: string;
  }>;
  readonly falsePositives: ReadonlyArray<string>;
}

const readFixture = async (): Promise<RedactionFixture> =>
  await Bun.file(
    `${import.meta.dir}/../fixtures/redaction/obvious-secrets.json`,
  ).json() as RedactionFixture;

const lineBreakCount = (value: string): number =>
  value.match(/\r\n|\r|\n/gu)?.length ?? 0;

test("redactReviewRequestV1 sanitizes every request string leaf", async () => {
  const fixture = await readFixture();
  const [apiKey, privateKey, highEntropyToken, encryptedPrivateKey] =
    fixture.secrets;
  if (
    apiKey === undefined ||
    privateKey === undefined ||
    highEntropyToken === undefined ||
    encryptedPrivateKey === undefined
  ) {
    throw new Error("Expected all obvious-secret fixtures");
  }
  const addedPrivateKeyLines = [
    ...privateKey.value.split("\n"),
    ...encryptedPrivateKey.value.split("\n"),
  ].map((line) => `+${line}`);

  const request = decodeReviewRequestV1({
    ...buildReviewRequestV1({
      repository: { scope: "working-tree" },
      config: { model: "fake-reviewer-v1" },
      files: [],
    }),
    systemInstructions: `System metadata ${highEntropyToken.value}`,
    prompt: `Prompt metadata ${apiKey.value}`,
    context: {
      contentType: "untrusted-repository-data",
      repository: { scope: "working-tree" },
      files: [{
        path: `src/${apiKey.value}.ts`,
        source: "working-tree",
        patch: [
          "@@ -0,0 +1,8 @@",
          `+const key = ${apiKey.value};`,
          `+const opaque = ${highEntropyToken.value};`,
          ...addedPrivateKeyLines,
        ].join("\n"),
      }],
    },
    options: { model: highEntropyToken.value },
  });

  const result = redactReviewRequestV1(request);
  const serializedRequest = JSON.stringify(result.request);

  for (const secret of fixture.secrets) {
    expect(serializedRequest).not.toContain(secret.value);
  }
  expect(result.request.systemInstructions).toContain(
    reviewRedactionTokens["high-entropy-token"],
  );
  expect(result.request.prompt).toContain(reviewRedactionTokens["api-key"]);
  expect(result.request.context.files[0]?.path).toBe(
    `src/${reviewRedactionTokens["api-key"]}.ts`,
  );
  expect(result.request.options.model).toBe(
    reviewRedactionTokens["high-entropy-token"],
  );
  expect(result.redaction).toEqual({
    schemaVersion: 1,
    totalRedactions: 8,
    reasons: [
      { reason: "api-key", count: 3 },
      { reason: "private-key", count: 2 },
      { reason: "high-entropy-token", count: 3 },
    ],
  });
  expect(JSON.stringify(result.redaction)).not.toContain(apiKey.value);
  expect(lineBreakCount(result.request.context.files[0]?.patch ?? "")).toBe(
    lineBreakCount(request.context.files[0]?.patch ?? ""),
  );
  expect(result.request.context.files[0]?.patch).toContain(
    `+${reviewRedactionTokens["private-key"]}\n+\n+`,
  );
});

test("redaction and replacement tokens are deterministic", async () => {
  const fixture = await readFixture();
  const request = buildReviewRequestV1({
    repository: { scope: "staged" },
    config: { model: "fake-reviewer-v1" },
    files: [{
      path: "src/example.ts",
      source: "staged",
      patch: fixture.secrets.map(({ value }) => `+${value}`).join("\n"),
    }],
  });

  expect(redactReviewRequestV1(request)).toEqual(
    redactReviewRequestV1(request),
  );
});

test("bounded detectors preserve documented false positives", async () => {
  const fixture = await readFixture();
  const patch = fixture.falsePositives.map((value) => `+${value}`).join("\n");
  const request = buildReviewRequestV1({
    repository: { scope: "working-tree" },
    config: { model: "fake-reviewer-v1" },
    files: [{ path: "src/fixtures.ts", source: "working-tree", patch }],
  });

  const result = redactReviewRequestV1(request);

  expect(result.request.context.files[0]?.patch).toBe(patch);
  expect(result.redaction).toEqual({
    schemaVersion: 1,
    totalRedactions: 0,
    reasons: [],
  });
});

test("oversized opaque tokens are replaced without unbounded entropy work", () => {
  const oversizedToken =
    "Aa0_" + "bC1-dE2_fG3+hI4/jK5=".repeat(220);
  const request = buildReviewRequestV1({
    repository: { scope: "working-tree" },
    config: { model: "fake-reviewer-v1" },
    files: [{
      path: "src/oversized-token.ts",
      source: "working-tree",
      patch: `+${oversizedToken}`,
    }],
  });

  const result = redactReviewRequestV1(request);

  expect(result.request.context.files[0]?.patch).toBe(
    `+${reviewRedactionTokens["high-entropy-token"]}`,
  );
  expect(result.redaction.reasons).toContainEqual({
    reason: "high-entropy-token",
    count: 1,
  });
});

test("redacted request decoding rejects inconsistent or unsafe summaries", () => {
  const result = redactReviewRequestV1(
    buildReviewRequestV1({
      repository: { scope: "working-tree" },
      config: { model: "fake-reviewer-v1" },
      files: [],
    }),
  );

  expect(() =>
    decodeRedactedReviewRequestV1({
      ...result,
      redaction: {
        schemaVersion: 1,
        totalRedactions: 2,
        reasons: [{ reason: "api-key", count: 1 }],
      },
    })
  ).toThrow("total does not match reasons");
  expect(() =>
    decodeRedactedReviewRequestV1({
      ...result,
      redaction: {
        schemaVersion: 1,
        totalRedactions: 2,
        reasons: [
          { reason: "api-key", count: 1 },
          { reason: "api-key", count: 1 },
        ],
      },
    })
  ).toThrow("duplicate reason");
  expect(() =>
    decodeRedactedReviewRequestV1({
      ...result,
      redaction: {
        schemaVersion: 1,
        totalRedactions: 1,
        reasons: [{ reason: "unknown", count: 1 }],
      },
    })
  ).toThrow();
});
