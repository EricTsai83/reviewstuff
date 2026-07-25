import * as BunServices from "@effect/platform-bun/BunServices";
import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import packageJson from "../../package.json";

const binaryPath = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join(process.cwd(), "dist", "reviewstuff");
}).pipe(Effect.provide(BunServices.layer), Effect.runSync);
const sourceCliPath = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join(process.cwd(), "src", "cli.ts");
}).pipe(Effect.provide(BunServices.layer), Effect.runSync);

interface CliResult {
  exitCode: number | null;
  success: boolean;
  stdout: string;
  stderr: string;
}

const streamToString = (
  stream: Stream.Stream<Uint8Array, unknown>,
): Effect.Effect<string, unknown> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(() => "", (output, chunk) => output + chunk),
  );

function formatFailure(args: ReadonlyArray<string>, result: CliResult): string {
  return [
    `Command failed: ${binaryPath} ${args.join(" ")}`,
    `exit code: ${result.exitCode ?? "unknown"}`,
    "stdout:",
    result.stdout,
    "stderr:",
    result.stderr,
  ].join("\n");
}

const runProcess = (
  program: string,
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<CliResult> =>
  Effect.gen(function* () {
    const process = yield* ChildProcess.make(program, args, {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        streamToString(process.stdout),
        streamToString(process.stderr),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );

    return {
      exitCode: Number(exitCode),
      success: exitCode === 0,
      stdout,
      stderr,
    };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer), Effect.runPromise);

const runCliProcess = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<CliResult> => runProcess(binaryPath, args, options);

const runSourceCliProcess = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<CliResult> =>
  runProcess(process.execPath, [sourceCliPath, ...args], options);

const runCli = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<string> =>
  runCliProcess(args, options).then((result) => {
    if (!result.success) {
      throw new Error(formatFailure(args, result));
    }

    return result.stdout;
  });

const runCliExpectingFailure = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<CliResult> =>
  runCliProcess(args, options).then((result) => {
    if (result.success) {
      throw new Error(
        [
          `Command unexpectedly succeeded: ${binaryPath} ${args.join(" ")}`,
          "exit code: 0",
          "stdout:",
          result.stdout,
          "stderr:",
          result.stderr,
        ].join("\n"),
      );
    }

    return result;
  });

const runGit = async (
  cwd: string,
  args: ReadonlyArray<string>,
): Promise<CliResult> => {
  const result = await Effect.gen(function* () {
    const process = yield* ChildProcess.make("git", args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        streamToString(process.stdout),
        streamToString(process.stderr),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );

    return {
      exitCode: Number(exitCode),
      success: exitCode === 0,
      stdout,
      stderr,
    };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer), Effect.runPromise);

  if (!result.success) {
    throw new Error(
      `git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`,
    );
  }

  return result;
};

const makeRepository = async (): Promise<string> => {
  const cwd = await FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) =>
      fs.makeTempDirectory({ prefix: "reviewstuff-git-e2e-" }),
    ),
    Effect.provide(BunServices.layer),
    Effect.runPromise,
  );

  await runGit(cwd, ["init", "--quiet"]);
  await runGit(cwd, ["config", "user.email", "reviewstuff@example.com"]);
  await runGit(cwd, ["config", "user.name", "Review Stuff"]);
  await Bun.write(`${cwd}/tracked.ts`, "export const initial = true;\n");
  await runGit(cwd, ["add", "tracked.ts"]);
  await runGit(cwd, ["commit", "--quiet", "-m", "initial"]);

  return cwd;
};

describe("reviewstuff binary", () => {
  test("--version prints the package version", async () => {
    expect((await runCli(["--version"])).trim()).toBe(
      `reviewstuff v${packageJson.version}`,
    );
  });

  test("--help prints command documentation", async () => {
    const stdout = await runCli(["--help"]);

    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("SUBCOMMANDS");
    expect(stdout).toContain("review");
    expect(stdout).toContain("doctor");
  });

  test("unknown command exits with a validation error", async () => {
    const result = await runCliExpectingFailure(["unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Unknown subcommand "unknown" for "reviewstuff"',
    );
    expect(result.stdout).toContain("USAGE");
  });

  test("review command reports a usage failure outside a git repository", async () => {
    const cwd = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeTempDirectory({ prefix: "reviewstuff-e2e-" }),
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );

    const result = await runCliExpectingFailure(["review"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Not a git repository");
  });

  test("review exits cleanly when the working tree has no changes", async () => {
    const cwd = await makeRepository();

    expect((await runCli(["review"], { cwd })).trim()).toBe(
      "No changes to review.",
    );

    expect(
      JSON.parse(await runCli(["review", "--json"], { cwd })),
    ).toMatchObject({
      schemaVersion: 5,
      scope: "working-tree",
      privacy: {
        mode: "local-only",
        transport: "local",
        decision: "allowed",
      },
      summary: {
        changedFiles: 0,
        reviewedFiles: 0,
        truncatedFiles: 0,
        skippedFiles: 0,
        findings: 0,
      },
      coverage: { schemaVersion: 2, complete: true, files: [] },
      budget: {
        schemaVersion: 1,
        unit: "tokens",
        maxTokens: 128_000,
        selectedRequestTokens: 0,
        fitsBudget: true,
      },
      findings: [],
    });
  });

  test("review accepts config presets and CLI selection overrides", async () => {
    const cwd = await makeRepository();
    await Bun.write(
      `${cwd}/.reviewstuff.yaml`,
      [
        "review:",
        "  preset: quick",
        "  privacy: cloud-allowed",
        "  engine: configured-engine",
        "  provider: configured-provider",
        "  model: configured-model",
        "  timeoutMs: 10000",
        "  concurrency: 1",
        "",
      ].join("\n"),
    );

    const report = JSON.parse(
      await runCli(
        [
          "review",
          "--preset",
          "standard",
          "--privacy",
          "local-only",
          "--engine",
          "fake",
          "--provider",
          "fake",
          "--model",
          "fake-reviewer-v1",
          "--timeout-ms",
          "120000",
          "--concurrency",
          "2",
          "--json",
        ],
        { cwd },
      ),
    ) as {
      schemaVersion: number;
      privacy: { mode: string; transport: string; decision: string };
    };

    expect(report.schemaVersion).toBe(5);
    expect(report.privacy).toEqual({
      mode: "local-only",
      transport: "local",
      decision: "allowed",
    });
  });

  test("invalid config does not expose rejected values or a stack trace", async () => {
    const cwd = await makeRepository();
    const rejectedValue = "sk-secret-value";
    await Bun.write(
      `${cwd}/.reviewstuff.yaml`,
      `review:\n  preset: ${rejectedValue}\n`,
    );

    const result = await runCliExpectingFailure(["review"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Invalid config file ");
    expect(result.stderr).toContain(".reviewstuff.yaml at review");
    expect(result.stderr).not.toContain(rejectedValue);
    expect(result.stderr).not.toContain("ConfigFileSchemaError");
    expect(result.stderr).not.toContain("at runReview");
  });

  test("unsupported engine selection fails instead of running the fake reviewer", async () => {
    const cwd = await makeRepository();
    const result = await runCliExpectingFailure(
      ["review", "--engine", "openai", "--model", "gpt-example"],
      { cwd },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unsupported review selection");
    expect(result.stderr).toContain("This build supports engine=fake");
  });

  test("default review includes staged, unstaged, and untracked text", async () => {
    const cwd = await makeRepository();
    await Bun.write(
      `${cwd}/staged.ts`,
      "// REVIEWSTUFF_FAKE_FINDING staged\n",
    );
    await runGit(cwd, ["add", "staged.ts"]);
    await Bun.write(
      `${cwd}/tracked.ts`,
      "export const initial = true;\n// REVIEWSTUFF_FAKE_FINDING unstaged\n",
    );
    await Bun.write(
      `${cwd}/untracked.ts`,
      "// REVIEWSTUFF_FAKE_FINDING untracked\n",
    );

    const report = JSON.parse(
      await runCli(["review", "--json"], { cwd }),
    ) as {
      summary: {
        changedFiles: number;
        reviewedFiles: number;
        truncatedFiles: number;
        skippedFiles: number;
        findings: number;
      };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.summary).toEqual({
      changedFiles: 3,
      reviewedFiles: 3,
      truncatedFiles: 0,
      skippedFiles: 0,
      findings: 3,
    });
    expect(report.findings.map((finding) => finding.file)).toEqual([
      "staged.ts",
      "tracked.ts",
      "untracked.ts",
    ]);
  });

  test("--staged reviews only the index", async () => {
    const cwd = await makeRepository();
    await Bun.write(
      `${cwd}/staged.ts`,
      "// REVIEWSTUFF_FAKE_FINDING staged\n",
    );
    await runGit(cwd, ["add", "staged.ts"]);
    await Bun.write(
      `${cwd}/untracked.ts`,
      "// REVIEWSTUFF_FAKE_FINDING untracked\n",
    );

    const report = JSON.parse(
      await runCli(["review", "--staged", "--json"], { cwd }),
    ) as {
      scope: string;
      summary: {
        changedFiles: number;
        reviewedFiles: number;
        truncatedFiles: number;
        skippedFiles: number;
        findings: number;
      };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.scope).toBe("staged");
    expect(report.summary).toEqual({
      changedFiles: 1,
      reviewedFiles: 1,
      truncatedFiles: 0,
      skippedFiles: 0,
      findings: 1,
    });
    expect(report.findings.map((finding) => finding.file)).toEqual([
      "staged.ts",
    ]);
  });

  test("working-tree findings use net lines and unique IDs", async () => {
    const cwd = await makeRepository();
    const marker = "// REVIEWSTUFF_FAKE_FINDING repeated";
    await Bun.write(`${cwd}/tracked.ts`, `${marker}\nexport const initial = true;\n`);
    await runGit(cwd, ["add", "tracked.ts"]);
    await Bun.write(
      `${cwd}/tracked.ts`,
      `${marker}\n${marker}\nexport const initial = true;\n`,
    );

    const report = JSON.parse(
      await runCli(["review", "--json"], { cwd }),
    ) as {
      findings: ReadonlyArray<{ id: string; line: number }>;
    };

    expect(report.findings.map((finding) => finding.line)).toEqual([1, 2]);
    expect(new Set(report.findings.map((finding) => finding.id)).size).toBe(2);
  });

  test("pure renames do not report existing markers as added lines", async () => {
    const cwd = await makeRepository();
    await Bun.write(
      `${cwd}/old.ts`,
      "// REVIEWSTUFF_FAKE_FINDING existing\n",
    );
    await runGit(cwd, ["add", "old.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add rename fixture"]);
    await runGit(cwd, ["mv", "old.ts", "new.ts"]);

    for (const args of [["review", "--json"], ["review", "--staged", "--json"]]) {
      const report = JSON.parse(await runCli(args, { cwd })) as {
        summary: {
          changedFiles: number;
          reviewedFiles: number;
          truncatedFiles: number;
          skippedFiles: number;
          findings: number;
        };
        findings: ReadonlyArray<unknown>;
      };

      expect(report.summary).toEqual({
        changedFiles: 1,
        reviewedFiles: 1,
        truncatedFiles: 0,
        skippedFiles: 0,
        findings: 0,
      });
      expect(report.findings).toEqual([]);
    }
  });

  test("review anchors literal paths at the repository root", async () => {
    const cwd = await makeRepository();
    await Bun.write(`${cwd}/:literal.ts`, "export const initial = true;\n");
    await runGit(cwd, ["--literal-pathspecs", "add", "--", ":literal.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add literal path"]);
    await Bun.write(
      `${cwd}/:literal.ts`,
      "export const initial = true;\n// REVIEWSTUFF_FAKE_FINDING literal\n",
    );
    await Bun.write(
      `${cwd}/tracked.ts`,
      "export const initial = true;\n// REVIEWSTUFF_FAKE_FINDING root\n",
    );
    await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) => fs.makeDirectory(`${cwd}/nested`)),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );

    const report = JSON.parse(
      await runCli(["review", "--json"], { cwd: `${cwd}/nested` }),
    ) as {
      summary: {
        changedFiles: number;
        reviewedFiles: number;
        truncatedFiles: number;
        skippedFiles: number;
        findings: number;
      };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.summary).toEqual({
      changedFiles: 2,
      reviewedFiles: 2,
      truncatedFiles: 0,
      skippedFiles: 0,
      findings: 2,
    });
    expect(report.findings.map((finding) => finding.file)).toEqual([
      ":literal.ts",
      "tracked.ts",
    ]);
  });

  test("default review budgets oversized hunks without skipping small text diffs", async () => {
    const cwd = await makeRepository();
    const largeBase = `first line\n${"unchanged line\n".repeat(50_000)}`;
    await Bun.write(`${cwd}/large-staged.txt`, largeBase);
    await Bun.write(`${cwd}/large-unstaged.txt`, largeBase);
    await runGit(cwd, ["add", "large-staged.txt", "large-unstaged.txt"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add large fixtures"]);
    await Bun.write(
      `${cwd}/large-staged.txt`,
      `REVIEWSTUFF_FAKE_FINDING staged\n${"unchanged line\n".repeat(50_000)}`,
    );
    await runGit(cwd, ["add", "large-staged.txt"]);
    await Bun.write(
      `${cwd}/large-unstaged.txt`,
      `REVIEWSTUFF_FAKE_FINDING unstaged\n${"unchanged line\n".repeat(50_000)}`,
    );
    await Bun.write(
      `${cwd}/included.ts`,
      "// REVIEWSTUFF_FAKE_FINDING included\n",
    );
    await Bun.write(
      `${cwd}/binary.dat`,
      new Uint8Array([0, 1, 2, 3, 4]),
    );
    await Bun.write(
      `${cwd}/large.txt`,
      `REVIEWSTUFF_FAKE_FINDING\n${"x".repeat(600 * 1024)}`,
    );

    const report = JSON.parse(
      await runCli(["review", "--json"], { cwd }),
    ) as {
      summary: {
        changedFiles: number;
        reviewedFiles: number;
        truncatedFiles: number;
        skippedFiles: number;
        findings: number;
      };
      coverage: {
        complete: boolean;
        files: ReadonlyArray<{
          path: string;
          status: "reviewed" | "truncated" | "skipped";
          reason?: string;
        }>;
      };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.summary).toEqual({
      changedFiles: 5,
      reviewedFiles: 3,
      truncatedFiles: 0,
      skippedFiles: 2,
      findings: 3,
    });
    expect(report.coverage.complete).toBe(false);
    expect(
      report.coverage.files.map(({ path, status, reason }) => ({
        path,
        status,
        ...(reason === undefined ? {} : { reason }),
      })),
    ).toEqual([
      { path: "binary.dat", status: "skipped", reason: "binary" },
      { path: "included.ts", status: "reviewed" },
      { path: "large-staged.txt", status: "reviewed" },
      { path: "large-unstaged.txt", status: "reviewed" },
      { path: "large.txt", status: "skipped", reason: "request-budget" },
    ]);
    expect(report.findings.map((finding) => finding.file)).toEqual([
      "included.ts",
      "large-staged.txt",
      "large-unstaged.txt",
    ]);
  });
});

describe("repository selection", () => {
  test("nested cwd resolves root config and root-relative diff paths", async () => {
    const repository = await makeRepository();
    const nested = `${repository}/nested/deeper`;
    await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) => fs.makeDirectory(nested, { recursive: true })),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );
    await Bun.write(
      `${repository}/.reviewstuff.yaml`,
      [
        "review:",
        "  requestBudget:",
        "    maxTokens: 100",
        "    fixedRequestOverheadTokens: 0",
        "    outputReserveTokens: 50",
        "",
      ].join("\n"),
    );
    await Bun.write(
      `${repository}/root-change.ts`,
      "// REVIEWSTUFF_FAKE_FINDING root\n",
    );

    const result = await runSourceCliProcess(["review", "--json"], {
      cwd: nested,
    });
    const report = JSON.parse(result.stdout) as {
      budget: { maxTokens: number };
      coverage: { files: ReadonlyArray<{ path: string }> };
    };

    expect(result.exitCode).toBe(0);
    expect(report.budget.maxTokens).toBe(100);
    expect(report.coverage.files.map((file) => file.path)).toEqual([
      ".reviewstuff.yaml",
      "root-change.ts",
    ]);
  });

  test("--dir uses config and diff from the same selected repository", async () => {
    const currentRepository = await makeRepository();
    const selectedRepository = await makeRepository();
    await Bun.write(
      `${currentRepository}/.reviewstuff.yaml`,
      "review:\n  engine: wrong-repository\n",
    );
    await Bun.write(
      `${selectedRepository}/selected.ts`,
      "// REVIEWSTUFF_FAKE_FINDING selected\n",
    );

    const result = await runSourceCliProcess(
      ["review", "--dir", selectedRepository, "--json"],
      { cwd: currentRepository },
    );
    const report = JSON.parse(result.stdout) as {
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.findings.map((finding) => finding.file)).toEqual([
      "selected.ts",
    ]);
  });

  test("invalid repository-root YAML fails closed without exposing values", async () => {
    const repository = await makeRepository();
    const rejectedValue = "sk-secret-parser-value";
    await Bun.write(
      `${repository}/.reviewstuff.yaml`,
      `review: [${rejectedValue}\n`,
    );

    const result = await runSourceCliProcess(["review"], { cwd: repository });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Invalid YAML config file ");
    expect(result.stderr).toContain(".reviewstuff.yaml at line");
    expect(result.stderr).not.toContain(rejectedValue);
    expect(result.stderr).not.toContain("ConfigFileParseError");
    expect(result.stderr).not.toContain("at runReview");
  });

  test("invalid typed config does not expose rejected literals", async () => {
    const repository = await makeRepository();
    const rejectedValue = "sk-secret-preset-value";
    await Bun.write(
      `${repository}/.reviewstuff.yaml`,
      `review:\n  preset: ${rejectedValue}\n`,
    );

    const result = await runSourceCliProcess(["review"], { cwd: repository });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(".reviewstuff.yaml at review.preset");
    expect(result.stderr).toContain("Expected quick or standard.");
    expect(result.stderr).not.toContain(rejectedValue);
    expect(result.stderr).not.toContain("ConfigFileSchemaError");
  });

  test("legacy config filenames are ignored", async () => {
    const repository = await makeRepository();
    await Bun.write(
      `${repository}/reviewstuff.config.json`,
      JSON.stringify({ review: { engine: "wrong-legacy-repository" } }),
    );
    await Bun.write(
      `${repository}/.reviewstuff.yml`,
      "review:\n  engine: wrong-yml-alias\n",
    );

    const result = await runSourceCliProcess(["review", "--json"], {
      cwd: repository,
    });
    const report = JSON.parse(result.stdout) as {
      budget: { maxTokens: number };
      coverage: { files: ReadonlyArray<{ path: string }> };
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.budget.maxTokens).toBe(128_000);
    expect(report.coverage.files.map((file) => file.path)).toEqual([
      ".reviewstuff.yml",
      "reviewstuff.config.json",
    ]);
  });

  test("--dir canonicalizes a symlinked nested repository path", async () => {
    const repository = await makeRepository();
    const nested = `${repository}/nested`;
    const linksDirectory = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeTempDirectory({ prefix: "reviewstuff-links-" })
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );
    const repositoryLink = `${linksDirectory}/repository`;
    await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeDirectory(nested).pipe(
          Effect.andThen(fs.symlink(repository, repositoryLink)),
        )
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );
    await Bun.write(
      `${repository}/symlinked.ts`,
      "// REVIEWSTUFF_FAKE_FINDING symlinked\n",
    );

    const result = await runSourceCliProcess([
      "review",
      "--dir",
      `${repositoryLink}/nested`,
      "--json",
    ]);
    const report = JSON.parse(result.stdout) as {
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(report.findings.map((finding) => finding.file)).toEqual([
      "symlinked.ts",
    ]);
  });

  test("--dir rejects non-repositories, missing paths, and bare repositories", async () => {
    const nonRepository = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeTempDirectory({ prefix: "reviewstuff-non-repo-" })
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );
    const missingRepository = `${nonRepository}/missing`;
    const bareRepository = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeTempDirectory({ prefix: "reviewstuff-bare-" })
      ),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );
    await runGit(bareRepository, ["init", "--bare", "--quiet"]);

    const [nonRepositoryResult, missingResult, bareResult] = await Promise.all([
      runSourceCliProcess(["review", "--dir", nonRepository]),
      runSourceCliProcess(["review", "--dir", missingRepository]),
      runSourceCliProcess(["review", "--dir", bareRepository]),
    ]);

    expect(nonRepositoryResult.exitCode).toBe(1);
    expect(nonRepositoryResult.stderr).toContain("Not a git repository");
    expect(missingResult.exitCode).toBe(1);
    expect(missingResult.stderr).toContain(
      `Repository path does not exist: ${missingRepository}.`,
    );
    expect(bareResult.exitCode).toBe(1);
    expect(bareResult.stderr).toContain(
      "The selected repository is not a Git working tree.",
    );
  });
});
