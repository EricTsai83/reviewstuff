import { describe, expect, test } from "bun:test";
import { renderReviewError } from "../../src/commands/review-error-renderer";
import {
  ConfigFileParseError,
  ConfigFileReadError,
  ConfigFileSchemaError,
} from "../../src/config/config-service";
import { ReviewEngineFailure } from "../../src/engines/review-engine";
import {
  GitChangedFileUnavailableError,
  GitCommandError,
  GitCommandOutputLimitError,
  GitCommandProcessError,
  GitCommandTimeoutError,
  GitExecutionError,
  GitInvalidOutputError,
  GitNotRepositoryError,
  GitRepositoryPathNotFoundError,
  GitUnmergedPathsError,
  GitWorkingTreeUnavailableError,
} from "../../src/git/git-service";
import {
  ReviewCloudPrivacyError,
  ReviewSelectionUnsupportedError,
  ReviewTimeoutError,
} from "../../src/use-cases/run-review";

describe("renderReviewError", () => {
  test.each([
    [
      new ConfigFileReadError({
        path: "/repo/.reviewstuff.yaml",
        cause: undefined,
      }),
      "Unable to read config file /repo/.reviewstuff.yaml.",
    ],
    [
      new ConfigFileParseError({
        path: "/repo/.reviewstuff.yaml",
        failure: "duplicate-key",
        line: 3,
        column: 3,
        cause: undefined,
      }),
      "Invalid YAML config file /repo/.reviewstuff.yaml at line 3, column 3: Mapping keys must be unique.",
    ],
    [
      new ConfigFileSchemaError({
        path: "/repo/.reviewstuff.yaml",
        fieldPath: ["review", "timeoutMs"],
        constraint: "The value does not satisfy the expected constraint.",
        cause: undefined,
      }),
      "Invalid config file /repo/.reviewstuff.yaml at review.timeoutMs: The value does not satisfy the expected constraint.",
    ],
    [
      new ReviewSelectionUnsupportedError({
        engine: "openai",
        provider: "openai",
        model: "gpt-example",
      }),
      "Unsupported review selection: engine=openai, provider=openai, model=gpt-example. This build supports engine=fake, provider=fake, model=fake-reviewer-v1.",
    ],
    [
      new ReviewCloudPrivacyError({
        mode: "local-only",
        transport: "cloud",
      }),
      "Cloud review is disabled by privacy=local-only. Re-run with `--privacy cloud-allowed` or set `review.privacy: cloud-allowed` in .reviewstuff.yaml after confirming repository data may be sent to the configured provider.",
    ],
  ])("renders config failures without causes or stack traces", (error, message) => {
    expect(renderReviewError(error)).toBe(message);
  });

  test("preserves invalid config causes without rendering values", () => {
    const cause = new Error("rejected-sensitive-value");
    const error = new ConfigFileSchemaError({
      path: "/repo/.reviewstuff.yaml",
      fieldPath: ["review"],
      constraint: "The object contains an unsupported field.",
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(renderReviewError(error)).toBe(
      "Invalid config file /repo/.reviewstuff.yaml at review: The object contains an unsupported field.",
    );
    expect(renderReviewError(error)).not.toContain("rejected-sensitive-value");
  });

  test("renders review timeout failures", () => {
    expect(
      renderReviewError(
        new ReviewTimeoutError({ timeoutMilliseconds: 30_000 }),
      ),
    ).toBe("Review timed out after 30s.");
  });

  test("renders typed review engine failures", () => {
    expect(
      renderReviewError(
        new ReviewEngineFailure({
          message: "Invalid response\nfrom engine.",
          cause: undefined,
        }),
      ),
    ).toBe("Review engine failed: Invalid response\\u000afrom engine.");
  });

  test.each([
    [
      "index-locked",
      "The Git index is locked. Make sure no other Git process is running, then remove a stale .git/index.lock file.",
    ],
    [
      "permission-denied",
      "Git could not access a repository file because permission was denied.",
    ],
    [
      "repository-corrupt",
      "Git reported corrupt repository data. Run `git fsck` for details.",
    ],
    [
      "unsafe-repository",
      "Git refused the repository because its ownership is considered unsafe. Verify the directory owner, then configure `safe.directory` only if you trust it.",
    ],
    ["unknown", "Run `git status` in the repository for more details."],
  ] as const)("renders %s command failures", (failure, guidance) => {
    expect(
      renderReviewError(
        new GitCommandError({
          operation: "list staged files",
          exitCode: 128,
          stderrLength: 10,
          failure,
        }),
      ),
    ).toBe(
      `Git list staged files failed with exit code 128. ${guidance}`,
    );
  });

  test.each([
    [
      new GitNotRepositoryError({
        exitCode: 128,
        stdoutLength: 0,
        stderrLength: 10,
      }),
      "Not a git repository (or any parent directory); detection exited with code 128.",
    ],
    [
      new GitRepositoryPathNotFoundError({
        path: "/missing/repo",
      }),
      "Repository path does not exist: /missing/repo.",
    ],
    [
      new GitWorkingTreeUnavailableError({
        stdoutLength: 6,
        stderrLength: 0,
      }),
      "The selected repository is not a Git working tree.",
    ],
    [
      new GitCommandTimeoutError({
        operation: "read diff",
        timeoutMilliseconds: 10_000,
        cause: undefined,
      }),
      "Git read diff timed out after 10s.",
    ],
    [
      new GitCommandOutputLimitError({
        operation: "read diff",
        maxOutputBytes: 10,
        observedOutputBytes: 11,
        cause: undefined,
      }),
      "Git read diff produced at least 11 bytes and exceeded the 10 byte combined output limit.",
    ],
    [
      new GitCommandProcessError({
        operation: "read diff",
        phase: "stderr",
        cause: undefined,
      }),
      "Git read diff failed while reading stderr.",
    ],
    [
      new GitInvalidOutputError({ operation: "list files", outputBytes: 7 }),
      "Git list files returned invalid output (7 byte(s)).",
    ],
    [
      new GitExecutionError({
        operation: "read diff",
        failure: "command-start",
        cause: undefined,
      }),
      "Unable to start Git while attempting to read diff.",
    ],
    [
      new GitExecutionError({
        operation: "read diff",
        failure: "command-termination",
        cause: undefined,
      }),
      "Unable to terminate Git after read diff.",
    ],
    [
      new GitExecutionError({
        operation: "inspect changed file",
        failure: "file-inspection",
        cause: undefined,
      }),
      "Unable to inspect changed file because file inspection failed.",
    ],
  ])("renders every review error category", (error, message) => {
    expect(renderReviewError(error)).toBe(message);
  });

  test("escapes terminal-controlled changed-file content", () => {
    expect(
      renderReviewError(
        new GitChangedFileUnavailableError({
          path: "bad\nname.ts",
          source: "untracked",
        }),
      ),
    ).toBe(
      "Changed file became unavailable while reading the diff: bad\\u000aname.ts [untracked].",
    );
  });

  test("escapes terminal-controlled conflict paths", () => {
    expect(
      renderReviewError(
        new GitUnmergedPathsError({ paths: ["bad\u001b[31m.ts"] }),
      ),
    ).toContain("- bad\\u001b[31m.ts");
  });
});
