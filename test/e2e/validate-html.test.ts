import { Command, FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect, Stream } from "effect";

const fs = FileSystem.FileSystem.pipe(
  Effect.provide(BunContext.layer),
  Effect.runSync,
);
const path = Path.Path.pipe(Effect.provide(BunContext.layer), Effect.runSync);
const repoRoot = path.resolve(import.meta.dir, "../..");
const validator = path.join(
  repoRoot,
  ".agents/skills/to-html/scripts/validate-html.mjs",
);

const streamToString = (
  stream: Stream.Stream<Uint8Array, unknown>,
): Effect.Effect<string, unknown> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold("", (output, chunk) => output + chunk),
  );

const validate = (css: string) =>
  Effect.gen(function* () {
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "reviewstuff-validate-html-",
    });
    const htmlFile = path.join(directory, "article.html");

    yield* fs.writeFileString(
      htmlFile,
      `<!doctype html><style>${css}</style>`,
    );

    const command = Command.make("bun", validator, htmlFile).pipe(
      Command.workingDirectory(repoRoot),
      Command.stderr("pipe"),
      Command.stdout("pipe"),
    );
    const process = yield* Command.start(command);
    const [, stderr, exitCode] = yield* Effect.all(
      [
        streamToString(process.stdout),
        streamToString(process.stderr),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );

    return { exitCode: Number(exitCode), stderr };
  }).pipe(Effect.scoped, Effect.provide(BunContext.layer), Effect.runPromise);

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
