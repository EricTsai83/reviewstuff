import { describe, expect, test } from "bun:test";
import { renderGitCommandError } from "../../src/output/command-error-renderer";

describe("renderGitCommandError", () => {
  test("renders actionable guidance for classified failures", () => {
    expect(
      renderGitCommandError({
        operation: "list staged files",
        exitCode: 128,
        failure: "index-locked",
      }),
    ).toBe(
      "Git list staged files failed with exit code 128. The Git index is locked. Make sure no other Git process is running, then remove a stale .git/index.lock file.",
    );
  });

  test("renders repository corruption guidance", () => {
    expect(
      renderGitCommandError({
        operation: "read staged diff",
        exitCode: 128,
        failure: "repository-corrupt",
      }),
    ).toEndWith("Git reported corrupt repository data. Run `git fsck` for details.");
  });

  test("renders safe repository ownership guidance", () => {
    expect(
      renderGitCommandError({
        operation: "detect git repository",
        exitCode: 128,
        failure: "unsafe-repository",
      }),
    ).toEndWith(
      "Git refused the repository because its ownership is considered unsafe. Verify the directory owner, then configure `safe.directory` only if you trust it.",
    );
  });

  test("provides a safe fallback for unknown failures", () => {
    expect(
      renderGitCommandError({
        operation: "resolve repository root",
        exitCode: 1,
        failure: "unknown",
      }),
    ).toBe(
      "Git resolve repository root failed with exit code 1. Run `git status` in the repository for more details.",
    );
  });
});
