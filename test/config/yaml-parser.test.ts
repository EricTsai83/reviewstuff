import { describe, expect, test } from "bun:test";
import {
  parseYamlConfig,
  YamlConfigParseError,
  type YamlConfigParseFailure,
} from "../../src/config/yaml-parser";

const expectParseFailure = (
  contents: string,
  failure: YamlConfigParseFailure,
) => {
  try {
    parseYamlConfig(contents);
    throw new Error("expected YAML parsing to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(YamlConfigParseError);
    if (!(error instanceof YamlConfigParseError)) {
      throw error;
    }
    expect(error.failure).toBe(failure);
    expect(error.line).toBeGreaterThan(0);
    expect(error.column).toBeGreaterThan(0);
  }
};

describe("strict YAML config parser", () => {
  test.each([
    ["", "blank"],
    ["# comment only\n", "comment-only"],
    ["---\n", "document marker only"],
    ["---\n# comment only\n", "document marker and comments"],
  ])("treats blank or comment-only input as an empty mapping", (contents) => {
    expect(parseYamlConfig(contents)).toEqual({});
  });

  test("accepts YAML 1.2 mappings and JSON flow syntax", () => {
    expect(
      parseYamlConfig(`
review:
  preset: standard
  engine: fake
  provider: fake
  model: fake-reviewer-v1
  timeoutMs: 120000
  concurrency: 2
`),
    ).toEqual({
      review: {
        preset: "standard",
        engine: "fake",
        provider: "fake",
        model: "fake-reviewer-v1",
        timeoutMs: 120_000,
        concurrency: 2,
      },
    });
    expect(parseYamlConfig('{"review":{"preset":"quick"}}')).toEqual({
      review: { preset: "quick" },
    });
  });

  test("constructs mappings without invoking prototype setters", () => {
    const parsed = parseYamlConfig("__proto__:\n  polluted: true\n");

    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("expected a parsed mapping");
    }
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(
      true,
    );
    expect("polluted" in {}).toBe(false);
  });

  test.each([
    [
      "review:\n  preset: quick\n  preset: standard\n",
      "duplicate-key",
      "duplicate key",
    ],
    [
      "review: &review\n  preset: standard\n",
      "anchor",
      "anchor",
    ],
    [
      "base: &base {}\nreview: *base\n",
      "alias",
      "alias",
    ],
    [
      "review: !custom {}\n",
      "custom-tag",
      "custom tag",
    ],
    [
      "review: {}\n---\nreview: {}\n",
      "multiple-documents",
      "multiple documents",
    ],
    [
      "review:\n  <<: {}\n",
      "merge-key",
      "merge key",
    ],
    [
      "review:\n  1: value\n",
      "non-string-key",
      "non-string mapping key",
    ],
    [
      "review:\n  timeoutMs: .inf\n",
      "unsupported-value",
      "non-finite number",
    ],
    [
      "%YAML 1.1\n---\nreview: {}\n",
      "unsupported-version",
      "non-1.2 document",
    ],
    [
      "review: [\n",
      "syntax",
      "invalid syntax",
    ],
  ] as const)("rejects unsupported YAML syntax and features", (contents, failure) => {
    expectParseFailure(contents, failure);
  });
});
