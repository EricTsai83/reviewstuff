import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  readGitObjectSize,
  requireGitSuccess,
  resolveEmptyTreeObjectId,
} from "../../src/git/git-command";
import {
  GitCommandError,
  GitCommandOutputLimitError,
  GitCommandProcessError,
  GitCommandTimeoutError,
  GitExecutionError,
  GitInvalidOutputError,
} from "../../src/git/git-errors";
import {
  CommandOutputLimitError,
  CommandProcessError,
  CommandStartError,
  CommandTerminationError,
  CommandTimeoutError,
} from "../../src/platform/command-runner";
import { gitResult, makeGitRunnerFixture } from "./git-runner-fixture";

describe("Git command helpers", () => {
  test("resolves repository-format empty-tree object IDs", async () => {
    const fixture = makeGitRunnerFixture();
    const objectId = "a".repeat(64);
    fixture.expectGit(
      ["hash-object", "-t", "tree", "/dev/null"],
      gitResult(`${objectId}\n`),
    );

    expect(
      await resolveEmptyTreeObjectId(fixture.runner, "/repo").pipe(
        Effect.runPromise,
      ),
    ).toBe(objectId);
    fixture.verify();
  });

  test("reads object size after verifying the object spec", async () => {
    const fixture = makeGitRunnerFixture();
    const objectId = "b".repeat(40);
    fixture.expectGit(
      ["rev-parse", "--verify", "--quiet", ":./file.ts"],
      gitResult(`${objectId}\n`),
    );
    fixture.expectGit(["cat-file", "-s", objectId], gitResult("123\n"));

    expect(
      await readGitObjectSize(fixture.runner, ":./file.ts", "/repo").pipe(
        Effect.runPromise,
      ),
    ).toBe(123n);
    fixture.verify();
  });

  test("returns undefined only for a missing object", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      ["rev-parse", "--verify", "--quiet", "HEAD:deleted.ts"],
      gitResult("", 1),
    );

    expect(
      await readGitObjectSize(
        fixture.runner,
        "HEAD:deleted.ts",
        "/repo",
      ).pipe(Effect.runPromise),
    ).toBeUndefined();
    fixture.verify();
  });

  test("maps non-zero Git exits to a classified command error", async () => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(
      ["status"],
      gitResult("", 128, "fatal: permission denied"),
    );

    const error = await requireGitSuccess(
      fixture.runner,
      "read status",
      ["status"],
      "/repo",
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitCommandError);
    if (!(error instanceof GitCommandError)) {
      throw new Error("Expected GitCommandError");
    }
    expect(error.failure).toBe("permission-denied");
    fixture.verify();
  });

  test.each([
    ["empty tree", ["hash-object", "-t", "tree", "/dev/null"], "bad-id\n"],
    [
      "object ID",
      ["rev-parse", "--verify", "--quiet", ":./file.ts"],
      "bad-id\n",
    ],
  ] as const)("rejects invalid %s metadata", async (kind, args, stdout) => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(args, gitResult(stdout));

    const error = kind === "empty tree"
      ? await resolveEmptyTreeObjectId(fixture.runner, "/repo").pipe(
        Effect.flip,
        Effect.runPromise,
      )
      : await readGitObjectSize(fixture.runner, ":./file.ts", "/repo").pipe(
        Effect.flip,
        Effect.runPromise,
      );

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    if (!(error instanceof GitInvalidOutputError)) {
      throw new Error("Expected GitInvalidOutputError");
    }
    expect(error.outputBytes).toBe(Buffer.byteLength(stdout));
    fixture.verify();
  });

  test("rejects invalid object-size metadata", async () => {
    const fixture = makeGitRunnerFixture();
    const objectId = "c".repeat(40);
    fixture.expectGit(
      ["rev-parse", "--verify", "--quiet", ":./file.ts"],
      gitResult(objectId),
    );
    fixture.expectGit(["cat-file", "-s", objectId], gitResult("large\n"));

    const error = await readGitObjectSize(
      fixture.runner,
      ":./file.ts",
      "/repo",
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(GitInvalidOutputError);
    if (!(error instanceof GitInvalidOutputError)) {
      throw new Error("Expected GitInvalidOutputError");
    }
    expect(error.operation).toBe("inspect git object");
    fixture.verify();
  });

  test.each([
    [
      new CommandStartError({ program: "git", cause: new Error("spawn") }),
      GitExecutionError,
    ],
    [
      new CommandTerminationError({
        program: "git",
        cause: new Error("kill"),
      }),
      GitExecutionError,
    ],
    [
      new CommandTimeoutError({
        program: "git",
        timeoutMilliseconds: 10_000,
      }),
      GitCommandTimeoutError,
    ],
    [
      new CommandOutputLimitError({
        program: "git",
        maxOutputBytes: 10,
        observedOutputBytes: 11,
      }),
      GitCommandOutputLimitError,
    ],
    [
      new CommandProcessError({
        program: "git",
        phase: "stdout",
        cause: new Error("stream"),
      }),
      GitCommandProcessError,
    ],
  ])("maps typed runner failure %# without losing the operation", async (
    runnerError,
    ExpectedError,
  ) => {
    const fixture = makeGitRunnerFixture();
    fixture.expectGit(["status"], runnerError);

    const error = await requireGitSuccess(
      fixture.runner,
      "read status",
      ["status"],
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(ExpectedError);
    expect(error.operation).toBe("read status");
    expect("cause" in error ? error.cause : undefined).toBe(runnerError);
    fixture.verify();
  });
});
