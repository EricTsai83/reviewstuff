import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as BunServices from "@effect/platform-bun/BunServices";

const liveSmokeEnabled = Bun.env.REVIEWSTUFF_LIVE_OPENAI === "1";

const run = async (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> => {
  const process = Bun.spawn([command, ...args], {
    cwd,
    env: Bun.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return { exitCode, stdout, stderr };
};

test.skipIf(!liveSmokeEnabled)(
  "paid opt-in: compiled CLI completes one OpenAI review",
  async () => {
    const fileSystem = FileSystem.FileSystem.pipe(
      Effect.provide(BunServices.layer),
      Effect.runSync,
    );
    const apiKey = Bun.env.OPENAI_API_KEY;
    const model = Bun.env.REVIEWSTUFF_LIVE_OPENAI_MODEL;

    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error(
        "Set OPENAI_API_KEY before enabling REVIEWSTUFF_LIVE_OPENAI=1.",
      );
    }
    if (model === undefined || model.trim().length === 0) {
      throw new Error(
        "Set REVIEWSTUFF_LIVE_OPENAI_MODEL before enabling REVIEWSTUFF_LIVE_OPENAI=1.",
      );
    }

    const binary = `${import.meta.dir}/../../dist/reviewstuff`;
    if (!(await Bun.file(binary).exists())) {
      throw new Error(
        "Run `bun run build` before enabling REVIEWSTUFF_LIVE_OPENAI=1.",
      );
    }

    const repository = await fileSystem.makeTempDirectory({
      prefix: "reviewstuff-openai-live-",
    }).pipe(
      Effect.runPromise,
    );

    try {
      expect(
        (await run("git", ["init", "--quiet"], repository)).exitCode,
      ).toBe(0);
      await Bun.write(
        `${repository}/live-smoke.ts`,
        "export const liveSmoke = true;\n",
      );

      const result = await run(
        binary,
        [
          "review",
          "--engine",
          "openai",
          "--model",
          model,
          "--privacy",
          "cloud-allowed",
          "--json",
        ],
        repository,
      );

      expect(result.stdout).not.toContain(apiKey);
      expect(result.stderr).not.toContain(apiKey);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        schemaVersion: 6,
        workload: "standard",
        privacy: {
          mode: "cloud-allowed",
          transport: "cloud",
          decision: "allowed",
        },
      });
    } finally {
      await fileSystem.remove(repository, { recursive: true }).pipe(
        Effect.runPromise,
      );
    }
  },
);
