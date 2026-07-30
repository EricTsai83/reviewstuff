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

test("only canonical subresource-integrity digests bypass redaction", () => {
  const valid =
    "sha512-QorRKhvwHDPwvE8lH5lE0r0dI2z+zj12VUN4h7hfoIunKUiXSoSOMZqF3w13W30RpV6ivsvJywUycaa/18yMPA==";
  const prefixedSecret = `${valid}A`;
  const result = redactPatch(`+${valid}\n+${prefixedSecret}`);

  expect(result.request.context.files[0]?.patch).toBe(
    `+${valid}\n+${reviewRedactionTokens["high-entropy-token"]}`,
  );
  expect(result.redaction.reasons).toContainEqual({
    reason: "high-entropy-token",
    count: 1,
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

const redactPatch = (patch: string) =>
  redactReviewRequestV1(
    buildReviewRequestV1({
      repository: { scope: "working-tree" },
      config: { model: "fake-reviewer-v1" },
      files: [{ path: "src/secrets.ts", source: "working-tree", patch }],
    }),
  );

const redactedPatch = (patch: string): string =>
  redactPatch(patch).request.context.files[0]?.patch ?? "";

test("redacts a single-character-class token of secret length", async () => {
  const fixture = await readFixture();
  const awsStyleKey = fixture.secrets.find(
    (secret) => secret.value === "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  );
  if (awsStyleKey === undefined) {
    throw new Error("Expected the AWS-style secret fixture");
  }

  const result = redactPatch(`+const secret = "${awsStyleKey.value}";`);

  expect(result.request.context.files[0]?.patch).toBe(
    `+const secret = "${reviewRedactionTokens["high-entropy-token"]}";`,
  );
  expect(result.redaction.reasons).toContainEqual({
    reason: "high-entropy-token",
    count: 1,
  });
});

test("redacts a private key that no end marker terminates", () => {
  // A truncated diff or a hunk boundary produces this shape, and the body after
  // the begin marker is key material even without the closing line.
  const patch = [
    "@@ -0,0 +1,3 @@",
    "+-----BEGIN PRIVATE KEY-----",
    "+bUY7a1F2S3d4G5h6J7k8L9m0N1p2Q3r4",
    "+cVZ8b2G3T4e5H6i7K8l9M0n1O2q3R4s5",
  ].join("\n");

  const result = redactPatch(patch);
  const patched = result.request.context.files[0]?.patch ?? "";

  expect(patched).toBe(
    [
      "@@ -0,0 +1,3 @@",
      `+${reviewRedactionTokens["private-key"]}`,
      "+",
      "+",
    ].join("\n"),
  );
  expect(result.redaction.reasons).toContainEqual({
    reason: "private-key",
    count: 1,
  });
  expect(lineBreakCount(patched)).toBe(lineBreakCount(patch));
});

test("redacts a private key embedded in a string literal", () => {
  const patch = [
    "@@ -0,0 +1,3 @@",
    '+const key = "-----BEGIN RSA PRIVATE KEY-----',
    "+bUY7a1F2S3d4G5h6J7k8L9m0N1p2Q3r4",
    '+-----END RSA PRIVATE KEY-----";',
  ].join("\n");

  const patched = redactedPatch(patch);

  expect(patched).toBe(
    [
      "@@ -0,0 +1,3 @@",
      `+const key = "${reviewRedactionTokens["private-key"]}`,
      "+",
      '+";',
    ].join("\n"),
  );
  expect(lineBreakCount(patched)).toBe(lineBreakCount(patch));
});

test("keeps per-line diff prefixes across a mixed redacted block", () => {
  // A removed `-----BEGIN` line carries the diff's own `-` in front of it.
  const patch = [
    "@@ -1,4 +1,4 @@",
    "------BEGIN PRIVATE KEY-----",
    "-bUY7a1F2S3d4G5h6J7k8L9m0N1p2Q3r4",
    " unchanged-context-line",
    "+cVZ8b2G3T4e5H6i7K8l9M0n1O2q3R4s5",
    "+-----END PRIVATE KEY-----",
  ].join("\n");

  const patched = redactedPatch(patch);

  // Every line keeps its own marker, so the hunk still removes two lines and
  // adds two lines around the same context line.
  expect(patched.split("\n")).toEqual([
    "@@ -1,4 +1,4 @@",
    `-${reviewRedactionTokens["private-key"]}`,
    "-",
    " ",
    "+",
    "+",
  ]);
  expect(lineBreakCount(patched)).toBe(lineBreakCount(patch));
});

test("redacts a CRLF private key block without changing line breaks", () => {
  const patch = [
    "@@ -0,0 +1,3 @@",
    "+-----BEGIN PRIVATE KEY-----",
    "+bUY7a1F2S3d4G5h6J7k8L9m0N1p2Q3r4",
    "+-----END PRIVATE KEY-----",
  ].join("\r\n");

  const patched = redactedPatch(patch);

  expect(patched).toBe(
    [
      "@@ -0,0 +1,3 @@",
      `+${reviewRedactionTokens["private-key"]}`,
      "+",
      "+",
    ].join("\r\n"),
  );
  expect(patched).toContain("\r\n");
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
