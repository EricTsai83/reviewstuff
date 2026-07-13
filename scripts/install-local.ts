import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { FileSystem, Path } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Data, Effect } from "effect";

interface InstallLocalOptions {
  readonly envPath?: string;
  readonly force?: boolean;
  readonly home?: string;
  readonly log?: (message: string) => void;
  readonly root?: string;
}

interface InstallLocalResult {
  readonly binDir: string;
  readonly linkPath: string;
  readonly targetBinary: string;
}

interface UninstallLocalOptions {
  readonly home?: string;
  readonly log?: (message: string) => void;
  readonly root?: string;
}

interface UninstallLocalResult {
  readonly linkPath: string;
  readonly removed: boolean;
  readonly targetBinary: string;
}

interface ParsedArgs {
  readonly force: boolean;
}

const pathDelimiter = ":";

class InstallLocalError extends Data.TaggedError("InstallLocalError")<{
  readonly message: string;
}> {}

const hasSystemErrorReason = (error: unknown, reason: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "SystemError" &&
  "reason" in error &&
  error.reason === reason;

const isReadLinkInvalidArgument = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "SystemError" &&
  "method" in error &&
  error.method === "readLink" &&
  "description" in error &&
  typeof error.description === "string" &&
  error.description.includes("EINVAL");

const requireHome = (): Effect.Effect<string, InstallLocalError> =>
  Bun.env.HOME === undefined
    ? Effect.fail(new InstallLocalError({ message: "$HOME is not set." }))
    : Effect.succeed(Bun.env.HOME);

const parseArgs = (args: ReadonlyArray<string>): ParsedArgs => ({
  force: args.includes("--force"),
});

const isPathInPath = (
  path: Path.Path,
  home: string,
  targetDir: string,
  pathValue: string,
): boolean => {
  const entries = pathValue
    .split(pathDelimiter)
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(entry.replace(/^~(?=$|\/)/, home)));

  return entries.includes(path.resolve(targetDir));
};

const requireExecutable = (
  fs: FileSystem.FileSystem,
  targetBinary: string,
): Effect.Effect<void, InstallLocalError> =>
  Effect.gen(function* () {
    const stats = yield* fs.stat(targetBinary).pipe(
      Effect.mapError(
        () =>
          new InstallLocalError({
            message: `Expected executable binary at ${targetBinary}. Run "bun run build" first.`,
          }),
      ),
    );

    if (stats.type !== "File") {
      return yield* new InstallLocalError({
        message: `${targetBinary} is not a file.`,
      });
    }

    yield* Effect.tryPromise({
      try: () => access(targetBinary, constants.X_OK),
      catch: () =>
        new InstallLocalError({
          message: `Expected executable binary at ${targetBinary}. Run "bun run build" first.`,
        }),
    });
  });

const readExistingLink = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  linkPath: string,
): Effect.Effect<string | null | undefined, unknown> =>
  fs.readLink(linkPath).pipe(
    Effect.map((linkTarget) => path.resolve(path.dirname(linkPath), linkTarget)),
    Effect.catchAll((error: unknown) => {
      if (
        hasSystemErrorReason(error, "BadResource") ||
        isReadLinkInvalidArgument(error)
      ) {
        return Effect.succeed(null);
      }

      if (hasSystemErrorReason(error, "NotFound")) {
        return Effect.succeed(undefined as undefined);
      }

      return Effect.fail(error);
    }),
  );

const installLocalEffect = ({
  force = false,
  home,
  envPath = Bun.env.PATH ?? "",
  root,
  log = console.log,
}: InstallLocalOptions = {}): Effect.Effect<
  InstallLocalResult,
  unknown,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedHome = home ?? (yield* requireHome());
    const repoRoot = path.resolve(import.meta.dir, "..");
    const targetBinary = path.join(root ?? repoRoot, "dist", "reviewstuff");
    const binDir = path.join(resolvedHome, ".local", "bin");
    const linkPath = path.join(binDir, "reviewstuff");

    yield* requireExecutable(fs, targetBinary);
    yield* fs.makeDirectory(binDir, { recursive: true });

    const existingTarget = yield* readExistingLink(fs, path, linkPath);

    if (existingTarget === path.resolve(targetBinary)) {
      log(`reviewstuff is already linked at ${linkPath}`);
    } else {
      if (existingTarget !== undefined) {
        if (!force) {
          return yield* new InstallLocalError({
            message: `${linkPath} already exists and does not point to this repo. Re-run with --force to replace it.`,
          });
        }

        yield* fs.remove(linkPath, { force: true });
      }

      yield* fs.symlink(targetBinary, linkPath);
      log(`Linked ${linkPath} -> ${targetBinary}`);
    }

    if (!isPathInPath(path, resolvedHome, binDir, envPath)) {
      log("");
      log(`${binDir} is not on PATH.`);
      log(`Add this to your shell profile: export PATH="${binDir}:$PATH"`);
    }

    return { binDir, linkPath, targetBinary };
  });

const uninstallLocalEffect = ({
  home,
  root,
  log = console.log,
}: UninstallLocalOptions = {}): Effect.Effect<
  UninstallLocalResult,
  unknown,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedHome = home ?? (yield* requireHome());
    const repoRoot = path.resolve(import.meta.dir, "..");
    const targetBinary = path.join(root ?? repoRoot, "dist", "reviewstuff");
    const linkPath = path.join(resolvedHome, ".local", "bin", "reviewstuff");
    const existingTarget = yield* readExistingLink(fs, path, linkPath);

    if (existingTarget === undefined) {
      log(`reviewstuff is not installed at ${linkPath}`);
      return { linkPath, removed: false, targetBinary };
    }

    if (existingTarget !== path.resolve(targetBinary)) {
      return yield* new InstallLocalError({
        message: `${linkPath} does not point to this repo; refusing to remove it.`,
      });
    }

    yield* fs.remove(linkPath);
    log(`Removed ${linkPath}`);

    return { linkPath, removed: true, targetBinary };
  });

const runWithBun = <A>(
  effect: Effect.Effect<A, unknown, FileSystem.FileSystem | Path.Path>,
): Promise<A> => effect.pipe(Effect.provide(BunContext.layer), Effect.runPromise);

export const installLocal = (
  options: InstallLocalOptions = {},
): Promise<InstallLocalResult> => runWithBun(installLocalEffect(options));

export const uninstallLocal = (
  options: UninstallLocalOptions = {},
): Promise<UninstallLocalResult> => runWithBun(uninstallLocalEffect(options));

const main = Effect.gen(function* () {
  const { force } = parseArgs(Bun.argv.slice(2));

  yield* installLocalEffect({ force });
});

if (Bun.argv[1] !== undefined && Bun.argv[1] === import.meta.path) {
  main.pipe(
    Effect.catchAll((error) =>
      Console.error(error instanceof Error ? error.message : String(error)).pipe(
        Effect.zipRight(
          Effect.sync(() => {
            process.exitCode = 1;
          }),
        ),
      ),
    ),
    Effect.provide(BunContext.layer),
    BunRuntime.runMain,
  );
}
