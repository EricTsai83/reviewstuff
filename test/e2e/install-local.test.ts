import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { installLocal, uninstallLocal } from "../../scripts/install-local";

interface Fixture {
  readonly binary: string;
  readonly home: string;
  readonly root: string;
}

interface ScriptResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

const tempPaths: Array<string> = [];
const fs = FileSystem.FileSystem.pipe(
  Effect.provide(BunContext.layer),
  Effect.runSync,
);
const path = Path.Path.pipe(Effect.provide(BunContext.layer), Effect.runSync);
const repoRoot = path.resolve(import.meta.dir, "../..");

const run = <A>(effect: Effect.Effect<A, unknown>): Promise<A> =>
  Effect.runPromise(effect);

const makeTempDir = async (): Promise<string> => {
  const tempPath = await run(
    fs.makeTempDirectory({ prefix: "reviewstuff-install-" }),
  );
  tempPaths.push(tempPath);

  return tempPath;
};

const makeFixture = async (): Promise<Fixture> => {
  const root = await makeTempDir();
  const home = await makeTempDir();
  const binary = path.join(root, "dist", "reviewstuff");

  await run(fs.makeDirectory(path.dirname(binary), { recursive: true }));
  await run(
    fs.writeFileString(binary, "#!/usr/bin/env sh\nexit 0\n", { mode: 0o755 }),
  );

  return { binary, home, root };
};

const runScriptWithoutHome = async (
  scriptName: string,
): Promise<ScriptResult> => {
  const env = Object.fromEntries(
    Object.entries(Bun.env).filter(([name]) => name !== "HOME"),
  );
  const child = Bun.spawn(["bun", path.join(repoRoot, "scripts", scriptName)], {
    cwd: repoRoot,
    env,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);

  return { exitCode, stderr, stdout };
};

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map((tempPath) =>
      run(fs.remove(tempPath, { force: true, recursive: true })),
    ),
  );
});

describe("installLocal", () => {
  test("creates a repeatable symlink in ~/.local/bin", async () => {
    const { binary, home, root } = await makeFixture();
    const messages: Array<string> = [];

    const first = await installLocal({
      envPath: path.join(home, ".local", "bin"),
      home,
      log: (message) => messages.push(message),
      root,
    });
    const second = await installLocal({
      envPath: first.binDir,
      home,
      log: (message) => messages.push(message),
      root,
    });

    expect(first.linkPath).toBe(path.join(home, ".local", "bin", "reviewstuff"));
    expect(await run(fs.readLink(first.linkPath))).toBe(binary);
    expect(second.linkPath).toBe(first.linkPath);
    expect(messages).toContain(`reviewstuff is already linked at ${first.linkPath}`);
  });

  test("refuses to overwrite an unrelated file without --force", async () => {
    const { home, root } = await makeFixture();
    const linkPath = path.join(home, ".local", "bin", "reviewstuff");

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.writeFileString(linkPath, "unrelated"));

    await expect(
      installLocal({ envPath: "", home, log: () => {}, root }),
    ).rejects.toThrow("already exists and does not point to this repo");
    expect(await run(fs.readFileString(linkPath))).toBe("unrelated");
  });

  test("replaces an unrelated file with --force", async () => {
    const { binary, home, root } = await makeFixture();
    const linkPath = path.join(home, ".local", "bin", "reviewstuff");

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.writeFileString(linkPath, "unrelated"));

    await installLocal({
      envPath: path.join(home, ".local", "bin"),
      force: true,
      home,
      log: () => {},
      root,
    });

    expect(await run(fs.readLink(linkPath))).toBe(binary);
  });

  test("prints PATH guidance when ~/.local/bin is missing from PATH", async () => {
    const { home, root } = await makeFixture();
    const messages: Array<string> = [];
    const binDir = path.join(home, ".local", "bin");

    await installLocal({
      envPath: "/usr/bin",
      home,
      log: (message) => messages.push(message),
      root,
    });

    expect(messages).toContain(`${binDir} is not on PATH.`);
    expect(messages).toContain(
      `Add this to your shell profile: export PATH="${binDir}:$PATH"`,
    );
  });

  test("requires the built binary to exist and be executable", async () => {
    const root = await makeTempDir();
    const home = await makeTempDir();

    await expect(
      installLocal({ envPath: "", home, log: () => {}, root }),
    ).rejects.toThrow('Run "bun run build" first');
  });

  test("rejects a binary that the current user cannot execute", async () => {
    const { binary, home, root } = await makeFixture();
    const linkPath = path.join(home, ".local", "bin", "reviewstuff");

    await run(fs.chmod(binary, 0o001));

    await expect(
      installLocal({ envPath: "", home, log: () => {}, root }),
    ).rejects.toThrow('Run "bun run build" first');
    expect(await run(fs.exists(linkPath))).toBe(false);
  });
});

describe("uninstallLocal", () => {
  test("removes a symlink owned by this repo", async () => {
    const { home, root } = await makeFixture();
    const installed = await installLocal({
      envPath: path.join(home, ".local", "bin"),
      home,
      log: () => {},
      root,
    });

    const result = await uninstallLocal({ home, log: () => {}, root });

    expect(result.removed).toBe(true);
    expect(await run(fs.exists(installed.linkPath))).toBe(false);
  });

  test("succeeds when the symlink is already absent", async () => {
    const { home, root } = await makeFixture();
    const messages: Array<string> = [];

    const result = await uninstallLocal({
      home,
      log: (message) => messages.push(message),
      root,
    });

    expect(result.removed).toBe(false);
    expect(messages).toContain(`reviewstuff is not installed at ${result.linkPath}`);
  });

  test("removes an owned dangling symlink", async () => {
    const { binary, home, root } = await makeFixture();
    const linkPath = path.join(home, ".local", "bin", "reviewstuff");

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.symlink(binary, linkPath));
    await run(fs.remove(binary));

    const result = await uninstallLocal({ home, log: () => {}, root });

    expect(result.removed).toBe(true);
    expect(await run(fs.exists(linkPath))).toBe(false);
  });

  test("refuses to remove an unrelated file", async () => {
    const { home, root } = await makeFixture();
    const linkPath = path.join(home, ".local", "bin", "reviewstuff");

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.writeFileString(linkPath, "unrelated"));

    await expect(
      uninstallLocal({ home, log: () => {}, root }),
    ).rejects.toThrow("does not point to this repo; refusing to remove it");
    expect(await run(fs.readFileString(linkPath))).toBe("unrelated");
  });

  test("refuses to remove a symlink owned by another repo", async () => {
    const { home, root } = await makeFixture();
    const otherRoot = await makeTempDir();
    const otherBinary = path.join(otherRoot, "dist", "reviewstuff");
    const linkPath = path.join(home, ".local", "bin", "reviewstuff");

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.symlink(otherBinary, linkPath));

    await expect(
      uninstallLocal({ home, log: () => {}, root }),
    ).rejects.toThrow("does not point to this repo; refusing to remove it");
    expect(await run(fs.readLink(linkPath))).toBe(otherBinary);
  });
});

describe("local install scripts", () => {
  test("reports a missing HOME without a runtime stack trace", async () => {
    for (const scriptName of ["install-local.ts", "uninstall-local.ts"]) {
      const result = await runScriptWithoutHome(scriptName);
      const output = `${result.stderr}\n${result.stdout}`;

      expect(result.exitCode).toBe(1);
      expect(output).toContain("$HOME is not set.");
      expect(output).not.toContain("at requireHome");
      expect(output).not.toContain("Bun v");
    }
  });
});
