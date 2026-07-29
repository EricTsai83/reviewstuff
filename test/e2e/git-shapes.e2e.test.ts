import { describe, expect, test } from "bun:test";
import { chmod, symlink } from "node:fs/promises";
import {
  makeRepository,
  makeTemporaryDirectory,
  runCli,
  runGit,
} from "./cli-harness";

interface CoverageReport {
  readonly summary: {
    readonly changedFiles: number;
    readonly reviewedFiles: number;
    readonly truncatedFiles: number;
    readonly skippedFiles: number;
    readonly findings: number;
  };
  readonly coverage: {
    readonly files: ReadonlyArray<{
      readonly path: string;
      readonly source: string;
      readonly status: string;
    }>;
  };
}

const review = async (
  cwd: string,
  args: ReadonlyArray<string> = [],
): Promise<CoverageReport> =>
  JSON.parse(
    await runCli(["review", ...args, "--json"], { cwd }),
  ) as CoverageReport;

const reportedPaths = (report: CoverageReport): ReadonlyArray<string> =>
  report.coverage.files.map((file) => file.path);

const occurrences = (
  paths: ReadonlyArray<string>,
  path: string,
): number => paths.filter((candidate) => candidate === path).length;

/**
 * Real-world Git shapes that used to fail the whole review instead of
 * reporting the file. Each fixture asserts the review completes and counts the
 * affected path exactly once.
 */
describe("reviewstuff against real Git working-tree shapes", () => {
  test("reports a file that became a symlink once", async () => {
    const cwd = await makeRepository();
    await Bun.write(`${cwd}/target.ts`, "export const target = true;\n");
    await Bun.write(`${cwd}/link.ts`, "export const link = true;\n");
    await runGit(cwd, ["add", "target.ts", "link.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add typechange fixture"]);
    await Bun.file(`${cwd}/link.ts`).delete();
    await symlink("target.ts", `${cwd}/link.ts`);

    const workingTree = await review(cwd);

    expect(occurrences(reportedPaths(workingTree), "link.ts")).toBe(1);
    expect(workingTree.summary.changedFiles).toBe(1);
    expect(workingTree.summary.skippedFiles).toBe(0);

    await runGit(cwd, ["add", "-A"]);
    const staged = await review(cwd, ["--staged"]);

    expect(occurrences(reportedPaths(staged), "link.ts")).toBe(1);
    expect(staged.summary.changedFiles).toBe(1);
  });

  test("reports a symlinked path containing a space once", async () => {
    // Git terminates the `---`/`+++` headers with a tab when the path contains
    // a space, which must not prevent attributing the record to the path.
    const cwd = await makeRepository();
    await Bun.write(`${cwd}/target.ts`, "export const target = true;\n");
    await Bun.write(`${cwd}/my link.ts`, "export const link = true;\n");
    await runGit(cwd, ["add", "target.ts", "my link.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add spaced fixture"]);
    await Bun.file(`${cwd}/my link.ts`).delete();
    await symlink("target.ts", `${cwd}/my link.ts`);

    const report = await review(cwd);

    expect(occurrences(reportedPaths(report), "my link.ts")).toBe(1);
    expect(report.summary.changedFiles).toBe(1);
  });

  test("reports a copy and its modified source separately", async () => {
    const cwd = await makeRepository();
    const source = `${"export const shared = true;\n".repeat(20)}`;
    await Bun.write(`${cwd}/source.ts`, source);
    await runGit(cwd, ["add", "source.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add copy fixture"]);
    await Bun.write(`${cwd}/copy.ts`, source);
    await Bun.write(`${cwd}/source.ts`, `${source}// REVIEWSTUFF added\n`);
    await runGit(cwd, ["add", "copy.ts", "source.ts"]);

    const report = await review(cwd, ["--staged"]);
    const paths = reportedPaths(report);

    expect(paths).toEqual(["copy.ts", "source.ts"]);
    expect(occurrences(paths, "copy.ts")).toBe(1);
    expect(occurrences(paths, "source.ts")).toBe(1);
  });

  test("reports both sides of a rename swap once", async () => {
    const cwd = await makeRepository();
    const alpha = `${"export const alpha = 1;\n".repeat(20)}`;
    const beta = `${"export const beta = 2;\n".repeat(20)}`;
    await Bun.write(`${cwd}/alpha.ts`, alpha);
    await Bun.write(`${cwd}/beta.ts`, beta);
    await runGit(cwd, ["add", "alpha.ts", "beta.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add swap fixture"]);
    await runGit(cwd, ["mv", "alpha.ts", "temp.ts"]);
    await runGit(cwd, ["mv", "beta.ts", "alpha.ts"]);
    await runGit(cwd, ["mv", "temp.ts", "beta.ts"]);

    const report = await review(cwd, ["--staged"]);
    const paths = reportedPaths(report);

    expect(occurrences(paths, "alpha.ts")).toBe(1);
    expect(occurrences(paths, "beta.ts")).toBe(1);
    expect(report.summary.changedFiles).toBe(2);
  });

  test("skips an embedded repository directory instead of failing", async () => {
    const cwd = await makeRepository();
    await Bun.write(`${cwd}/embedded/inner.ts`, "export const inner = true;\n");
    await runGit(`${cwd}/embedded`, ["init", "--quiet"]);
    await runGit(`${cwd}/embedded`, [
      "config",
      "user.email",
      "reviewstuff@example.com",
    ]);
    await runGit(`${cwd}/embedded`, ["config", "user.name", "Review Stuff"]);
    await runGit(`${cwd}/embedded`, ["add", "inner.ts"]);
    await runGit(`${cwd}/embedded`, ["commit", "--quiet", "-m", "inner"]);
    await Bun.write(`${cwd}/visible.ts`, "export const visible = true;\n");

    const report = await review(cwd);

    expect(reportedPaths(report)).toEqual(["visible.ts"]);
  });

  test("counts a path removed from the index only once", async () => {
    const cwd = await makeRepository();
    await runGit(cwd, ["rm", "--cached", "--quiet", "tracked.ts"]);

    const report = await review(cwd);
    const paths = reportedPaths(report);

    expect(occurrences(paths, "tracked.ts")).toBe(1);
    expect(report.summary.changedFiles).toBe(1);
  });

  test("reviews blank context lines under diff.suppressBlankEmpty", async () => {
    const cwd = await makeRepository();
    await runGit(cwd, ["config", "diff.suppressBlankEmpty", "true"]);
    await Bun.write(`${cwd}/blank.ts`, "export const first = 1;\n\nexport const second = 2;\n");
    await runGit(cwd, ["add", "blank.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add blank-line fixture"]);
    await Bun.write(
      `${cwd}/blank.ts`,
      "export const first = 1;\n\nexport const second = 2;\n// REVIEWSTUFF_FAKE_FINDING blank\n",
    );

    const report = await review(cwd);

    expect(reportedPaths(report)).toEqual(["blank.ts"]);
    expect(report.summary).toMatchObject({
      changedFiles: 1,
      reviewedFiles: 1,
      skippedFiles: 0,
      findings: 1,
    });
  });

  test("reviews a submodule pointer change under diff.submodule=log", async () => {
    // `diff.submodule=log` replaces the pointer record with a commit log that
    // has no `diff --git` header, which used to fail the whole review.
    const inner = await makeTemporaryDirectory("reviewstuff-submodule-");
    await runGit(inner, ["init", "--quiet"]);
    await runGit(inner, ["config", "user.email", "reviewstuff@example.com"]);
    await runGit(inner, ["config", "user.name", "Review Stuff"]);
    await Bun.write(`${inner}/inner.ts`, "export const version = 1;\n");
    await runGit(inner, ["add", "inner.ts"]);
    await runGit(inner, ["commit", "--quiet", "-m", "first"]);
    await Bun.write(`${inner}/inner.ts`, "export const version = 2;\n");
    await runGit(inner, ["commit", "--quiet", "-am", "second"]);

    const cwd = await makeRepository();
    await runGit(cwd, ["config", "diff.submodule", "log"]);
    await runGit(cwd, [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      "--quiet",
      inner,
      "sub",
    ]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add submodule"]);
    await runGit(`${cwd}/sub`, ["checkout", "--quiet", "HEAD~1"]);

    const report = await review(cwd);

    expect(reportedPaths(report)).toEqual(["sub"]);
    expect(report.summary).toMatchObject({
      changedFiles: 1,
      reviewedFiles: 1,
      skippedFiles: 0,
    });
  });

  test("reads real content when a path selects a textconv driver", async () => {
    // The user's config defines the converter and `.gitattributes` selects the
    // paths. A converted patch can be empty even though the file changed, which
    // used to fail the whole review, and it replaces the content the reported
    // line numbers refer to.
    const cwd = await makeRepository();
    // The converter lives outside the repository so it is not itself reviewed.
    const tools = await makeTemporaryDirectory("reviewstuff-textconv-");
    await Bun.write(`${tools}/convert.sh`, "#!/bin/sh\necho CONVERTED\n");
    await chmod(`${tools}/convert.sh`, 0o755);
    await runGit(cwd, ["config", "diff.demo.textconv", `${tools}/convert.sh`]);
    await Bun.write(
      `${cwd}/.gitattributes`,
      "converted.ts diff=demo\nuntracked.ts diff=demo\n",
    );
    await Bun.write(`${cwd}/converted.ts`, "export const version = 1;\n");
    await runGit(cwd, ["add", ".gitattributes", "converted.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add textconv fixture"]);
    await Bun.write(
      `${cwd}/converted.ts`,
      "export const version = 1;\n// REVIEWSTUFF_FAKE_FINDING converted\n",
    );
    await Bun.write(
      `${cwd}/untracked.ts`,
      "// REVIEWSTUFF_FAKE_FINDING untracked\n",
    );

    const request = JSON.parse(
      await runCli(["review", "--dry-run-request", "--json"], { cwd }),
    ) as {
      readonly context: {
        readonly files: ReadonlyArray<{
          readonly path: string;
          readonly patch: string;
        }>;
      };
    };

    expect(request.context.files.map((file) => file.path)).toEqual([
      "converted.ts",
      "untracked.ts",
    ]);
    for (const file of request.context.files) {
      expect(file.patch).toContain("REVIEWSTUFF_FAKE_FINDING");
      expect(file.patch).not.toContain("CONVERTED");
    }

    const report = await review(cwd);

    expect(report.summary).toMatchObject({
      changedFiles: 2,
      reviewedFiles: 2,
      skippedFiles: 0,
      findings: 2,
    });
  });

  test("never runs the configured filesystem-monitor hook", async () => {
    // `core.fsmonitor` either starts a daemon that outlives the command or, in
    // hook form, executes a user-configured program on every scan. Neither
    // belongs in a read-only review.
    const cwd = await makeRepository();
    // The hook and its log live outside the repository so neither is reviewed.
    const tools = await makeTemporaryDirectory("reviewstuff-fsmonitor-");
    const hookLog = `${tools}/fsmonitor-hook.log`;
    await Bun.write(
      `${tools}/fsmonitor-hook.sh`,
      `#!/bin/sh\necho "ran $*" >> ${hookLog}\nexit 1\n`,
    );
    await chmod(`${tools}/fsmonitor-hook.sh`, 0o755);
    await runGit(cwd, [
      "config",
      "core.fsmonitor",
      `${tools}/fsmonitor-hook.sh`,
    ]);
    await Bun.write(
      `${cwd}/watched.ts`,
      "// REVIEWSTUFF_FAKE_FINDING watched\n",
    );

    const report = await review(cwd);

    expect(reportedPaths(report)).toContain("watched.ts");
    expect(await Bun.file(hookLog).exists()).toBe(false);
  });

  test("keeps diff context despite an inherited GIT_DIFF_OPTS", async () => {
    const cwd = await makeRepository();
    await Bun.write(
      `${cwd}/context.ts`,
      "export const first = 1;\nexport const second = 2;\nexport const third = 3;\n",
    );
    await runGit(cwd, ["add", "context.ts"]);
    await runGit(cwd, ["commit", "--quiet", "-m", "add context fixture"]);
    await Bun.write(
      `${cwd}/context.ts`,
      "export const first = 1;\nexport const second = 2;\nexport const third = 4;\n",
    );

    const request = JSON.parse(
      await runCli(["review", "--dry-run-request", "--json"], {
        cwd,
        env: { ...process.env, GIT_DIFF_OPTS: "--unified=0" },
      }),
    ) as {
      readonly context: {
        readonly files: ReadonlyArray<{ readonly patch: string }>;
      };
    };

    expect(request.context.files[0]?.patch).toContain("@@ -1,3 +1,3 @@");
  });

  test("reviews the selected repository despite an inherited GIT_DIR", async () => {
    const cwd = await makeRepository();
    const unrelated = await makeTemporaryDirectory("reviewstuff-unrelated-");
    await runGit(unrelated, ["init", "--quiet"]);
    await Bun.write(`${cwd}/inherited.ts`, "export const inherited = true;\n");

    const stdout = await runCli(["review", "--dir", cwd, "--json"], {
      cwd: unrelated,
      env: {
        ...process.env,
        GIT_DIR: `${unrelated}/.git`,
        GIT_WORK_TREE: unrelated,
      },
    });

    expect(reportedPaths(JSON.parse(stdout) as CoverageReport)).toEqual([
      "inherited.ts",
    ]);
  });
});
