import { expect, test } from "bun:test";
import {
  renderJsonRequestPreview,
  renderTerminalRequestPreview,
} from "../../src/output/request-preview-renderer";
import { buildReviewRequestV1 } from "../../src/review/review-request";

const request = buildReviewRequestV1({
  repository: { scope: "working-tree" },
  config: { model: "fake-reviewer-v1" },
  files: [{
    path: "src/unsafe\u001b[31m.ts",
    source: "working-tree",
    patch: "@@ -0,0 +1 @@\n+export const preview = true;\u2028\n",
  }],
});

test("JSON preview renders only the normalized request document", () => {
  const output = renderJsonRequestPreview(request);

  expect(JSON.parse(output)).toEqual(request);
  expect(output.trim().startsWith("{")).toBe(true);
  expect(output.trim().endsWith("}")).toBe(true);
});

test("terminal preview explains the normalized/provider boundary safely", () => {
  const output = renderTerminalRequestPreview(request);

  expect(output).toContain("Normalized review request preview (not sent):");
  expect(output).toContain(
    "exact redacted, budget-selected ReviewRequestV1 passed to the review engine",
  );
  expect(output).toContain(
    "provider-specific envelope that is not shown here",
  );
  expect(output).toContain("src/unsafe\\u001b[31m.ts");
  expect(output).toContain("\\u2028");
  expect(output).not.toContain("\u001b");
  expect(output).not.toContain("\u2028");
});
