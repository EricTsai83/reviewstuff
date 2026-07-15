import { Command, FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect, Stream } from "effect";
import packageJson from "../../package.json";

const binaryPath = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join(process.cwd(), "dist", "reviewstuff");
}).pipe(Effect.provide(BunContext.layer), Effect.runSync);

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
    Stream.runFold("", (output, chunk) => output + chunk),
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

const runCliProcess = (
  args: ReadonlyArray<string>,
  options: { cwd?: string } = {},
): Promise<CliResult> =>
  Effect.gen(function* () {
    const baseCommand = Command.make(binaryPath, ...args).pipe(
      Command.stdout("pipe"),
      Command.stderr("pipe"),
    );
    const command =
      options.cwd === undefined
        ? baseCommand
        : baseCommand.pipe(Command.workingDirectory(options.cwd));
    const process = yield* Command.start(command);
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        streamToString(process.stdout),
        streamToString(process.stderr),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );

    return {
      exitCode,
      success: exitCode === 0,
      stdout,
      stderr,
    };
  }).pipe(Effect.scoped, Effect.provide(BunContext.layer), Effect.runPromise);

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
    const command = Command.make("git", ...args).pipe(
      Command.workingDirectory(cwd),
      Command.stdout("pipe"),
      Command.stderr("pipe"),
    );
    const process = yield* Command.start(command);
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        streamToString(process.stdout),
        streamToString(process.stderr),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );

    return { exitCode, success: exitCode === 0, stdout, stderr };
  }).pipe(Effect.scoped, Effect.provide(BunContext.layer), Effect.runPromise);

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
    Effect.provide(BunContext.layer),
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
    expect((await runCli(["--version"])).trim()).toBe(packageJson.version);
  });

  test("--help prints command documentation", async () => {
    const stdout = await runCli(["--help"]);

    expect(stdout).toContain(`reviewstuff ${packageJson.version}`);
    expect(stdout).toContain("COMMANDS");
    expect(stdout).toContain("review");
    expect(stdout).toContain("doctor");
  });

  test("unknown command exits with a validation error", async () => {
    const result = await runCliExpectingFailure(["unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Invalid subcommand for reviewstuff - use one of 'review', 'doctor'",
    );
    expect(result.stdout).toBe("");
  });

  test("review command reports a usage failure outside a git repository", async () => {
    const cwd = await FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) =>
        fs.makeTempDirectory({ prefix: "reviewstuff-e2e-" }),
      ),
      Effect.provide(BunContext.layer),
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
    ).toEqual({
      schemaVersion: 1,
      scope: "working-tree",
      summary: { changedFiles: 0, findings: 0 },
      findings: [],
    });
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
      summary: { changedFiles: number; findings: number };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.summary).toEqual({ changedFiles: 3, findings: 3 });
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
      summary: { changedFiles: number; findings: number };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.scope).toBe("staged");
    expect(report.summary).toEqual({ changedFiles: 1, findings: 1 });
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
      Effect.provide(BunContext.layer),
      Effect.runPromise,
    );

    const report = JSON.parse(
      await runCli(["review", "--json"], { cwd: `${cwd}/nested` }),
    ) as {
      summary: { changedFiles: number; findings: number };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.summary).toEqual({ changedFiles: 2, findings: 2 });
    expect(report.findings.map((finding) => finding.file)).toEqual([
      ":literal.ts",
      "tracked.ts",
    ]);
  });

  test("default review skips binary and large changed files", async () => {
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
      summary: { changedFiles: number; findings: number };
      findings: ReadonlyArray<{ file: string }>;
    };

    expect(report.summary).toEqual({ changedFiles: 1, findings: 1 });
    expect(report.findings.map((finding) => finding.file)).toEqual([
      "included.ts",
    ]);
  });
});
