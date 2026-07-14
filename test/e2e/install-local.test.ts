import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import packageJson from "../../package.json";
import { installLocal, uninstallLocal } from "../../scripts/local-bin";

interface Fixture {
  readonly binary: string;
  readonly installDir: string;
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
const binEntry = Object.entries(packageJson.bin)[0];

if (binEntry === undefined) {
  throw new Error("package.json must define a binary");
}

const [binaryName, relativeBinaryPath] = binEntry;

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
  const installDir = path.join(await makeTempDir(), ".local", "bin");
  const binary = path.resolve(root, relativeBinaryPath);

  await run(fs.makeDirectory(path.dirname(binary), { recursive: true }));
  await run(
    fs.writeFileString(binary, "#!/usr/bin/env sh\nexit 0\n", { mode: 0o755 }),
  );

  return { binary, installDir, root };
};

const makeExecutable = async (dir: string, name: string): Promise<string> => {
  const executable = path.join(dir, name);

  await run(fs.makeDirectory(dir, { recursive: true }));
  await run(
    fs.writeFileString(executable, "#!/usr/bin/env sh\nexit 0\n", {
      mode: 0o755,
    }),
  );

  return executable;
};

const runBunWithoutHome = async (
  args: ReadonlyArray<string>,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<ScriptResult> => {
  const env = Object.fromEntries(
    Object.entries(Bun.env).filter(([name]) => name !== "HOME"),
  );
  const child = Bun.spawn(["bun", ...args], {
    cwd: repoRoot,
    env: { ...env, ...extraEnv },
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

const runScriptWithoutHome = (scriptName: string): Promise<ScriptResult> =>
  runBunWithoutHome([path.join(repoRoot, "scripts", scriptName)]);

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map((tempPath) =>
      run(fs.remove(tempPath, { force: true, recursive: true })),
    ),
  );
});

describe("installLocal", () => {
  test("creates a repeatable symlink in the configured install directory", async () => {
    const { binary, installDir, root } = await makeFixture();
    const messages: Array<string> = [];

    const first = await installLocal({
      pathEnv: installDir,
      installDir,
      log: (message) => messages.push(message),
      repoRoot: root,
    });
    const second = await installLocal({
      pathEnv: first.binDir,
      installDir,
      log: (message) => messages.push(message),
      repoRoot: root,
    });

    expect(first.linkPath).toBe(path.join(installDir, binaryName));
    expect(await run(fs.readLink(first.linkPath))).toBe(binary);
    expect(second.linkPath).toBe(first.linkPath);
    expect(messages).toContain(
      `${binaryName} is already linked at ${first.linkPath}`,
    );
  });

  test("refuses to overwrite an unrelated file by default", async () => {
    const { installDir, root } = await makeFixture();
    const linkPath = path.join(installDir, binaryName);

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.writeFileString(linkPath, "unrelated"));

    await expect(
      installLocal({ installDir, pathEnv: "", log: () => {}, repoRoot: root }),
    ).rejects.toThrow("already exists and does not point to this repo");
    expect(await run(fs.readFileString(linkPath))).toBe("unrelated");
  });

  test("replaces an unrelated file when replaceExisting is enabled", async () => {
    const { binary, installDir, root } = await makeFixture();
    const linkPath = path.join(installDir, binaryName);
    const messages: Array<string> = [];

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.writeFileString(linkPath, "unrelated"));

    await installLocal({
      installDir,
      pathEnv: installDir,
      log: (message) => messages.push(message),
      replaceExisting: true,
      repoRoot: root,
    });

    expect(await run(fs.readLink(linkPath))).toBe(binary);
    expect(messages).toContain(`Removing existing ${linkPath} (--force)`);
  });

  test("replaces an unrelated directory when replaceExisting is enabled", async () => {
    const { binary, installDir, root } = await makeFixture();
    const linkPath = path.join(installDir, binaryName);

    await run(fs.makeDirectory(path.join(linkPath, "nested"), { recursive: true }));
    await run(fs.writeFileString(path.join(linkPath, "nested", "file"), "unrelated"));

    await installLocal({
      installDir,
      pathEnv: installDir,
      log: () => {},
      replaceExisting: true,
      repoRoot: root,
    });

    expect(await run(fs.readLink(linkPath))).toBe(binary);
  });

  test("prints PATH guidance when the install directory is missing from PATH", async () => {
    const { installDir, root } = await makeFixture();
    const messages: Array<string> = [];

    await installLocal({
      installDir,
      pathEnv: "/usr/bin",
      log: (message) => messages.push(message),
      repoRoot: root,
    });

    expect(messages).toContain(`${installDir} is not on PATH.`);
    expect(messages).toContain(
      `Add this to your shell profile: export PATH="${installDir}:$PATH"`,
    );
  });

  test("reports when the local command overrides an existing command on PATH", async () => {
    const { binary, installDir, root } = await makeFixture();
    const productionDir = await makeTempDir();
    const otherProductionDir = await makeTempDir();
    const productionBinary = await makeExecutable(productionDir, binaryName);
    const otherProductionBinary = await makeExecutable(
      otherProductionDir,
      binaryName,
    );
    const messages: Array<string> = [];

    const result = await installLocal({
      installDir,
      pathEnv: `${installDir}:${productionDir}:${otherProductionDir}`,
      log: (message) => messages.push(message),
      repoRoot: root,
    });

    expect(messages).toContain(`Local ${binaryName} is active.`);
    expect(messages).toContain(`  command: ${result.linkPath}`);
    expect(messages).toContain(`  target:  ${binary}`);
    expect(messages).toContain(`  previous: ${productionBinary}`);
    expect(messages).toContain(`  also on PATH: ${otherProductionBinary}`);
    expect(messages).toContain(
      `Run "bun run uninstall:local" to restore ${productionBinary}.`,
    );
  });

  test("reports when an earlier PATH entry keeps the production command active", async () => {
    const { installDir, root } = await makeFixture();
    const productionDir = await makeTempDir();
    const productionBinary = await makeExecutable(productionDir, binaryName);
    const messages: Array<string> = [];

    const result = await installLocal({
      installDir,
      pathEnv: `${productionDir}:${installDir}`,
      log: (message) => messages.push(message),
      repoRoot: root,
    });

    expect(messages).toContain(
      `Local ${binaryName} is linked but is not active.`,
    );
    expect(messages).toContain(`  active: ${productionBinary}`);
    expect(messages).toContain(`  local:  ${result.linkPath}`);
    expect(messages).toContain(
      `Move ${installDir} before ${productionDir} in PATH to activate the local build.`,
    );
  });

  test("requires the built binary to exist and be executable", async () => {
    const root = await makeTempDir();
    const installDir = await makeTempDir();

    await expect(
      installLocal({ installDir, pathEnv: "", log: () => {}, repoRoot: root }),
    ).rejects.toThrow('Run "bun run build" first');
  });

  test("rejects a binary that the current user cannot execute", async () => {
    const { binary, installDir, root } = await makeFixture();
    const linkPath = path.join(installDir, binaryName);

    await run(fs.chmod(binary, 0o001));

    await expect(
      installLocal({ installDir, pathEnv: "", log: () => {}, repoRoot: root }),
    ).rejects.toThrow('Run "bun run build" first');
    expect(await run(fs.exists(linkPath))).toBe(false);
  });
});

describe("uninstallLocal", () => {
  test("removes a symlink owned by this repo", async () => {
    const { installDir, root } = await makeFixture();
    const installed = await installLocal({
      installDir,
      pathEnv: installDir,
      log: () => {},
      repoRoot: root,
    });

    const result = await uninstallLocal({
      installDir,
      log: () => {},
      repoRoot: root,
    });

    expect(result.removed).toBe(true);
    expect(await run(fs.exists(installed.linkPath))).toBe(false);
  });

  test("reports the production command restored after removing the local link", async () => {
    const { installDir, root } = await makeFixture();
    const productionDir = await makeTempDir();
    const productionBinary = await makeExecutable(productionDir, binaryName);
    const pathEnv = `${installDir}:${productionDir}`;
    const messages: Array<string> = [];

    await installLocal({
      installDir,
      pathEnv,
      log: () => {},
      repoRoot: root,
    });
    await uninstallLocal({
      installDir,
      pathEnv,
      log: (message) => messages.push(message),
      repoRoot: root,
    });

    expect(messages).toContain(`${binaryName} now resolves to:`);
    expect(messages).toContain(`  ${productionBinary}`);
  });

  test("succeeds when the symlink is already absent", async () => {
    const { installDir, root } = await makeFixture();
    const messages: Array<string> = [];

    const result = await uninstallLocal({
      installDir,
      log: (message) => messages.push(message),
      repoRoot: root,
    });

    expect(result.removed).toBe(false);
    expect(messages).toContain(`${binaryName} is not installed at ${result.linkPath}`);
  });

  test("removes an owned dangling symlink", async () => {
    const { binary, installDir, root } = await makeFixture();
    const linkPath = path.join(installDir, binaryName);

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.symlink(binary, linkPath));
    await run(fs.remove(binary));

    const result = await uninstallLocal({
      installDir,
      log: () => {},
      repoRoot: root,
    });

    expect(result.removed).toBe(true);
    expect(await run(fs.exists(linkPath))).toBe(false);
  });

  test("refuses to remove an unrelated file", async () => {
    const { installDir, root } = await makeFixture();
    const linkPath = path.join(installDir, binaryName);

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.writeFileString(linkPath, "unrelated"));

    await expect(
      uninstallLocal({ installDir, log: () => {}, repoRoot: root }),
    ).rejects.toThrow("does not point to this repo; refusing to remove it");
    expect(await run(fs.readFileString(linkPath))).toBe("unrelated");
  });

  test("refuses to remove a symlink owned by another repo", async () => {
    const { installDir, root } = await makeFixture();
    const otherRoot = await makeTempDir();
    const otherBinary = path.resolve(otherRoot, relativeBinaryPath);
    const linkPath = path.join(installDir, binaryName);

    await run(fs.makeDirectory(path.dirname(linkPath), { recursive: true }));
    await run(fs.symlink(otherBinary, linkPath));

    await expect(
      uninstallLocal({ installDir, log: () => {}, repoRoot: root }),
    ).rejects.toThrow("does not point to this repo; refusing to remove it");
    expect(await run(fs.readLink(linkPath))).toBe(otherBinary);
  });
});

describe("local install scripts", () => {
  test("defaults to $HOME/.local/bin and expands ~ in PATH", async () => {
    const { binary, root } = await makeFixture();
    const homeDir = await makeTempDir();
    const program = [
      'import { installLocal } from "./scripts/local-bin.ts";',
      "await installLocal({",
      '  pathEnv: "~/.local/bin",',
      "  log: () => {},",
      "  repoRoot: Bun.env.TEST_ROOT,",
      "});",
    ].join("\n");
    const result = await runBunWithoutHome(
      ["-e", program],
      { HOME: homeDir, TEST_ROOT: root },
    );
    const linkPath = path.join(homeDir, ".local", "bin", binaryName);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await run(fs.readLink(linkPath))).toBe(binary);
  });

  test("accepts an explicit install directory when HOME is missing", async () => {
    const { installDir, root } = await makeFixture();
    const program = [
      'import { installLocal } from "./scripts/local-bin.ts";',
      "await installLocal({",
      "  installDir: Bun.env.TEST_INSTALL_DIR,",
      '  pathEnv: "/usr/bin",',
      "  log: () => {},",
      "  repoRoot: Bun.env.TEST_ROOT,",
      "});",
    ].join("\n");
    const result = await runBunWithoutHome(
      ["-e", program],
      { TEST_INSTALL_DIR: installDir, TEST_ROOT: root },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("rejects unknown arguments", async () => {
    const result = await runBunWithoutHome([
      path.join(repoRoot, "scripts", "install-local-bin.ts"),
      "--frce",
    ]);

    expect(result.exitCode).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toContain(
      "Unknown argument: --frce. Supported: --force",
    );
  });

  test("reports a missing HOME without a runtime stack trace", async () => {
    for (const scriptName of [
      "install-local-bin.ts",
      "uninstall-local-bin.ts",
    ]) {
      const result = await runScriptWithoutHome(scriptName);
      const output = `${result.stderr}\n${result.stdout}`;

      expect(result.exitCode).toBe(1);
      expect(output).toContain("$HOME is not set.");
      expect(output).not.toContain("at requireHome");
      expect(output).not.toContain("Bun v");
    }
  });
});
