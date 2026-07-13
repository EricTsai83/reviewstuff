import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const repoRoot = resolve(import.meta.dir, "../..");
const validator = join(
  repoRoot,
  ".agents/skills/to-html/scripts/validate-html.mjs",
);

const validate = async (css: string) => {
  const directory = await mkdtemp(join(tmpdir(), "reviewstuff-validate-html-"));
  const htmlFile = join(directory, "article.html");

  try {
    await writeFile(htmlFile, `<!doctype html><style>${css}</style>`);
    const process = Bun.spawn(["bun", validator, htmlFile], {
      cwd: repoRoot,
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([
      process.exited,
      new Response(process.stderr).text(),
    ]);

    return { exitCode, stderr };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

describe("validate-html", () => {
  test("accepts braces inside quoted CSS values", async () => {
    const result = await validate(`
      .brace::before { content: "{}"; }
      .escaped::before { content: "\\\"{}\\\""; }
    `);

    expect(result.exitCode).toBe(0);
  });

  test("reports rulesets containing only whitespace or comments", async () => {
    const whitespace = await validate(".empty {   }");
    const comment = await validate(".empty { /* intentionally blank */ }");

    expect(whitespace.exitCode).toBe(1);
    expect(whitespace.stderr).toContain("empty CSS ruleset");
    expect(comment.exitCode).toBe(1);
    expect(comment.stderr).toContain("empty CSS ruleset");
  });
});
