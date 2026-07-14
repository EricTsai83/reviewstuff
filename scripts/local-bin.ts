import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Data, Effect } from "effect";
import packageJson from "../package.json";

export interface InstallLocalOptions {
  /** Defaults to `$HOME/.local/bin`. */
  readonly installDir?: string;
  readonly log?: (message: string) => void;
  readonly pathEnv?: string;
  /** Replace a path at the install location when it does not point to this repo. */
  readonly replaceExisting?: boolean;
  readonly repoRoot?: string;
}

export interface InstallLocalResult {
  readonly binDir: string;
  readonly linkPath: string;
  readonly targetBinary: string;
}

export interface UninstallLocalOptions {
  /** Defaults to `$HOME/.local/bin`. */
  readonly installDir?: string;
  readonly log?: (message: string) => void;
  readonly pathEnv?: string;
  readonly repoRoot?: string;
}

export interface UninstallLocalResult {
  readonly linkPath: string;
  readonly removed: boolean;
  readonly targetBinary: string;
}

interface LocalPaths {
  readonly binaryName: string;
  readonly binDir: string;
  readonly linkPath: string;
  readonly targetBinary: string;
}

type SymlinkStatus =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "NotSymlink" }
  | { readonly _tag: "Symlink"; readonly target: string };

const pathDelimiter = ":";

export class LocalBinError extends Data.TaggedError("LocalBinError")<{
  readonly message: string;
}> {}

export type LocalBinScriptError = LocalBinError | PlatformError;

const hasErrorCode = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code;

const requireHome = (): Effect.Effect<string, LocalBinError> =>
  Bun.env.HOME === undefined
    ? Effect.fail(new LocalBinError({ message: "$HOME is not set." }))
    : Effect.succeed(Bun.env.HOME);

const resolveEnvPathEntries = (
  path: Path.Path,
  pathEnv: string,
): ReadonlyArray<string> => {
  const home = Bun.env.HOME;
  const seen = new Set<string>();

  return pathEnv
    .split(pathDelimiter)
    .filter((entry) => entry.length > 0)
    .map((entry) =>
      path.resolve(
        home === undefined ? entry : entry.replace(/^~(?=$|\/)/, home),
      ),
    )
    .filter((entry) => {
      if (seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const isDirOnEnvPath = (
  path: Path.Path,
  dir: string,
  pathEnv: string,
): boolean =>
  resolveEnvPathEntries(path, pathEnv).includes(path.resolve(dir));

const findExecutablesOnPath = (
  path: Path.Path,
  binaryName: string,
  pathEnv: string,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.promise(async () => {
    const candidates = await Promise.all(
      resolveEnvPathEntries(path, pathEnv).map(async (dir) => {
        const candidate = path.join(dir, binaryName);

        try {
          const stats = await stat(candidate);

          if (!stats.isFile()) {
            return undefined;
          }

          await access(candidate, constants.X_OK);
          return candidate;
        } catch {
          return undefined;
        }
      }),
    );

    return candidates.filter(
      (candidate): candidate is string => candidate !== undefined,
    );
  });

const logCurrentCommand = (
  path: Path.Path,
  binaryName: string,
  pathEnv: string,
  log: (message: string) => void,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const activeCommand = (yield* findExecutablesOnPath(
      path,
      binaryName,
      pathEnv,
    ))[0];

    log("");

    if (activeCommand === undefined) {
      log(`${binaryName} is no longer available on PATH.`);
      return;
    }

    log(`${binaryName} now resolves to:`);
    log(`  ${activeCommand}`);
  });

const resolveInstallDir = (
  path: Path.Path,
  installDir?: string,
): Effect.Effect<string, LocalBinError> => {
  if (installDir === undefined || installDir.length === 0) {
    return Effect.map(requireHome(), (home) =>
      path.join(home, ".local", "bin"),
    );
  }

  if (/^~(?=$|\/)/.test(installDir)) {
    return Effect.map(requireHome(), (home) =>
      path.resolve(installDir.replace(/^~(?=$|\/)/, home)),
    );
  }

  return Effect.succeed(path.resolve(installDir));
};

const resolveLocalPaths = (
  path: Path.Path,
  binDir: string,
  repoRoot?: string,
): Effect.Effect<LocalPaths, LocalBinError> =>
  Effect.gen(function* () {
    const binEntries = Object.entries(packageJson.bin);
    const binEntry = binEntries[0];

    if (binEntries.length !== 1 || binEntry === undefined) {
      return yield* new LocalBinError({
        message:
          "package.json must define exactly one binary for local installation.",
      });
    }

    const [binaryName, relativeBinaryPath] = binEntry;
    const resolvedRoot = repoRoot ?? path.resolve(import.meta.dir, "..");
    const targetBinary = path.resolve(resolvedRoot, relativeBinaryPath);

    return {
      binaryName,
      binDir,
      linkPath: path.join(binDir, binaryName),
      targetBinary,
    };
  });

const requireExecutable = (
  fs: FileSystem.FileSystem,
  targetBinary: string,
): Effect.Effect<void, LocalBinError> =>
  Effect.gen(function* () {
    const stats = yield* fs.stat(targetBinary).pipe(
      Effect.mapError(
        () =>
          new LocalBinError({
            message: `Expected executable binary at ${targetBinary}. Run "bun run build" first.`,
          }),
      ),
    );

    if (stats.type !== "File") {
      return yield* new LocalBinError({
        message: `${targetBinary} is not a file.`,
      });
    }

    yield* Effect.tryPromise({
      try: () => access(targetBinary, constants.X_OK),
      catch: () =>
        new LocalBinError({
          message: `Expected executable binary at ${targetBinary}. Run "bun run build" first.`,
        }),
    });
  });

const inspectSymlink = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  linkPath: string,
): Effect.Effect<SymlinkStatus, PlatformError> =>
  fs.readLink(linkPath).pipe(
    Effect.map(
      (linkTarget): SymlinkStatus => ({
        _tag: "Symlink",
        target: path.resolve(path.dirname(linkPath), linkTarget),
      }),
    ),
    Effect.catchTag("SystemError", (error) => {
      if (error.reason === "NotFound") {
        return Effect.succeed<SymlinkStatus>({ _tag: "Missing" });
      }

      if (hasErrorCode(error.cause, "EINVAL")) {
        return Effect.succeed<SymlinkStatus>({ _tag: "NotSymlink" });
      }

      return Effect.fail(error);
    }),
  );

export const installLocalEffect = ({
  installDir,
  pathEnv = Bun.env.PATH ?? "",
  replaceExisting = false,
  repoRoot,
  log = console.log,
}: InstallLocalOptions = {}): Effect.Effect<
  InstallLocalResult,
  LocalBinScriptError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedInstallDir = yield* resolveInstallDir(path, installDir);
    const { binaryName, binDir, linkPath, targetBinary } =
      yield* resolveLocalPaths(path, resolvedInstallDir, repoRoot);

    yield* requireExecutable(fs, targetBinary);
    yield* fs.makeDirectory(binDir, { recursive: true });

    const symlinkStatus = yield* inspectSymlink(fs, path, linkPath);

    if (
      symlinkStatus._tag === "Symlink" &&
      symlinkStatus.target === targetBinary
    ) {
      log(`${binaryName} is already linked at ${linkPath}`);
    } else {
      if (symlinkStatus._tag !== "Missing") {
        if (!replaceExisting) {
          return yield* new LocalBinError({
            message: `${linkPath} already exists and does not point to this repo. Re-run with --force to replace it.`,
          });
        }

        log(`Removing existing ${linkPath} (--force)`);
        yield* fs.remove(linkPath, { force: true, recursive: true });
      }

      yield* fs.symlink(targetBinary, linkPath);
      log(`Linked ${linkPath} -> ${targetBinary}`);
    }

    const binDirIsOnPath = isDirOnEnvPath(path, binDir, pathEnv);
    const commandsOnPath = yield* findExecutablesOnPath(
      path,
      binaryName,
      pathEnv,
    );
    const activeCommand = commandsOnPath[0];

    log("");

    if (activeCommand === linkPath) {
      const otherCommands = commandsOnPath.filter(
        (command) => command !== linkPath,
      );
      const previousCommand = otherCommands[0];

      log(`Local ${binaryName} is active.`);
      log(`  command: ${linkPath}`);
      log(`  target:  ${targetBinary}`);

      if (previousCommand === undefined) {
        log(`Run "bun run uninstall:local" to remove the local command.`);
      } else {
        log(`  previous: ${previousCommand}`);

        for (const command of otherCommands.slice(1)) {
          log(`  also on PATH: ${command}`);
        }

        log(
          `Run "bun run uninstall:local" to restore ${previousCommand}.`,
        );
      }
    } else {
      log(`Local ${binaryName} is linked but is not active.`);

      if (activeCommand !== undefined) {
        log(`  active: ${activeCommand}`);
      }

      log(`  local:  ${linkPath}`);

      if (binDirIsOnPath && activeCommand !== undefined) {
        log(
          `Move ${binDir} before ${path.dirname(activeCommand)} in PATH to activate the local build.`,
        );
      }
    }

    if (!binDirIsOnPath) {
      log("");
      log(`${binDir} is not on PATH.`);
      log(`Add this to your shell profile: export PATH="${binDir}:$PATH"`);
    }

    return { binDir, linkPath, targetBinary };
  });

export const uninstallLocalEffect = ({
  installDir,
  pathEnv = Bun.env.PATH ?? "",
  repoRoot,
  log = console.log,
}: UninstallLocalOptions = {}): Effect.Effect<
  UninstallLocalResult,
  LocalBinScriptError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedInstallDir = yield* resolveInstallDir(path, installDir);
    const { binaryName, linkPath, targetBinary } = yield* resolveLocalPaths(
      path,
      resolvedInstallDir,
      repoRoot,
    );
    const symlinkStatus = yield* inspectSymlink(fs, path, linkPath);

    if (symlinkStatus._tag === "Missing") {
      log(`${binaryName} is not installed at ${linkPath}`);
      yield* logCurrentCommand(path, binaryName, pathEnv, log);
      return { linkPath, removed: false, targetBinary };
    }

    if (
      symlinkStatus._tag === "NotSymlink" ||
      symlinkStatus.target !== targetBinary
    ) {
      return yield* new LocalBinError({
        message: `${linkPath} does not point to this repo; refusing to remove it.`,
      });
    }

    yield* fs.remove(linkPath);
    log(`Removed ${linkPath}`);
    yield* logCurrentCommand(path, binaryName, pathEnv, log);

    return { linkPath, removed: true, targetBinary };
  });

const runWithBun = <A>(
  effect: Effect.Effect<
    A,
    LocalBinScriptError,
    FileSystem.FileSystem | Path.Path
  >,
): Promise<A> =>
  effect.pipe(Effect.provide(BunContext.layer), Effect.runPromise);

export const installLocal = (
  options: InstallLocalOptions = {},
): Promise<InstallLocalResult> => runWithBun(installLocalEffect(options));

export const uninstallLocal = (
  options: UninstallLocalOptions = {},
): Promise<UninstallLocalResult> => runWithBun(uninstallLocalEffect(options));

export const runLocalBinMain = (
  effect: Effect.Effect<
    unknown,
    LocalBinScriptError,
    FileSystem.FileSystem | Path.Path
  >,
): void =>
  effect.pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Console.error(error.message);
        process.exitCode = 1;
      }),
    ),
    Effect.provide(BunContext.layer),
    BunRuntime.runMain,
  );
