import * as Effect from "effect/Effect";
import * as CommandRunner from "../platform/command-runner";
import {
  GitInvalidOutputError,
  makeGitCommandError,
  mapCommandExecutionError,
  type GitError,
} from "./git-errors";

/**
 * Pins every user-configurable setting that changes the shape of the output
 * this codebase parses. Without the pins, a personal `~/.gitconfig` can turn a
 * parseable diff into one that fails the whole review: `suppressBlankEmpty`
 * strips the leading space from blank context lines, the prefix settings
 * rewrite or remove the `a/` and `b/` path prefixes used to attribute records,
 * and `diff.submodule=log` replaces a submodule pointer record with a commit
 * log that has no `diff --git` header at all.
 */
export const gitConfigArguments = [
  "-c",
  "core.quotePath=false",
  // A read-only review must not start git's filesystem-monitor daemon, which
  // outlives the command, nor execute the monitor hook the user configured.
  "-c",
  "core.fsmonitor=false",
  "-c",
  "diff.noprefix=false",
  "-c",
  "diff.mnemonicPrefix=false",
  "-c",
  "diff.srcPrefix=a/",
  "-c",
  "diff.dstPrefix=b/",
  "-c",
  "diff.relative=false",
  "-c",
  "diff.suppressBlankEmpty=false",
  "-c",
  "diff.submodule=short",
] as const;
export const gitCommandArguments = [
  ...gitConfigArguments,
  "--literal-pathspecs",
] as const;
/**
 * Inherited Git environment variables can redirect a command away from the
 * repository selected by `--dir`, so they are removed instead of trusted.
 * `GIT_DIFF_OPTS` is removed for the same reason as the config pins above: it
 * overrides an explicit `--unified=3` and would silently drop diff context,
 * and being an environment variable it cannot be pinned with `-c`.
 * Optional locks are disabled because reviewing must not mutate the index.
 */
const gitCommandEnvironment: Readonly<
  Record<string, string | undefined>
> = {
  LC_ALL: "C",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_DIFF_OPTS: undefined,
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_COMMON_DIR: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
  GIT_CEILING_DIRECTORIES: undefined,
  GIT_NAMESPACE: undefined,
};
export const gitCommandTimeoutMilliseconds = 10_000;
/**
 * Diff commands run copy detection over the whole tree, which can exceed the
 * short metadata timeout on a large repository.
 */
export const gitDiffTimeoutMilliseconds = 60_000;
export const gitMetadataMaxOutputBytes = 4 * 1024 * 1024;
export const gitObjectMetadataMaxOutputBytes = 1_024;

/**
 * `maxOutputBytes` is required: `executeGit` is the only boundary that reads
 * unbounded subprocess output, so every call site states its own cap instead of
 * inheriting one that may not match what it reads.
 */
export interface GitCommandOptions {
  readonly maxOutputBytes: number;
  readonly workingDirectory?: string;
  readonly timeoutMilliseconds?: number;
}

/** Options for callers that use the metadata cap `requireGitSuccess` applies. */
export type GitRequestOptions = Omit<GitCommandOptions, "maxOutputBytes">;

const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

/**
 * Single contract for Git object-id output: trailing whitespace is trimmed and
 * the value must be a full SHA-1 or SHA-256 object name.
 */
export const parseGitObjectId = (output: string): string | undefined => {
  const objectId = output.trim();
  return objectIdPattern.test(objectId) ? objectId : undefined;
};

export const executeGit = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  {
    maxOutputBytes,
    workingDirectory,
    timeoutMilliseconds = gitCommandTimeoutMilliseconds,
  }: GitCommandOptions,
) =>
  runner
    .run({
      program: "git",
      args: [...gitCommandArguments, ...args],
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
      environment: gitCommandEnvironment,
      timeout: timeoutMilliseconds,
      maxOutputBytes,
    })
    .pipe(
      Effect.mapError((cause) => mapCommandExecutionError(operation, cause)),
    );

export const requireGitSuccess = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  options: GitRequestOptions = {},
) =>
  executeGit(runner, operation, args, {
    maxOutputBytes: gitMetadataMaxOutputBytes,
    ...options,
  }).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout)
        : Effect.fail(makeGitCommandError(operation, result)),
    ),
  );

export const resolveEmptyTreeObjectId = (
  runner: CommandRunner.Service,
  repositoryRoot: string,
): Effect.Effect<string, GitError> => {
  const operation = "resolve empty tree";

  return requireGitSuccess(
    runner,
    operation,
    ["hash-object", "-t", "tree", "/dev/null"],
    { workingDirectory: repositoryRoot },
  ).pipe(
    Effect.flatMap((output) => {
      const emptyTreeObjectId = parseGitObjectId(output);

      return emptyTreeObjectId !== undefined
        ? Effect.succeed(emptyTreeObjectId)
        : Effect.fail(
            new GitInvalidOutputError({
              operation,
              outputBytes: Buffer.byteLength(output),
            }),
          );
    }),
  );
};

export const readGitObjectSize = (
  runner: CommandRunner.Service,
  objectSpec: string,
  workingDirectory: string,
): Effect.Effect<bigint | undefined, GitError> => {
  const resolveObjectOperation = "resolve git object";
  const inspectObjectOperation = "inspect git object";

  return executeGit(
    runner,
    resolveObjectOperation,
    ["rev-parse", "--verify", "--quiet", objectSpec],
    { maxOutputBytes: gitObjectMetadataMaxOutputBytes, workingDirectory },
  ).pipe(
    Effect.flatMap(
      (objectVerification): Effect.Effect<bigint | undefined, GitError> => {
        if (objectVerification.exitCode === 1) {
          return Effect.succeed(undefined);
        }

        if (objectVerification.exitCode !== 0) {
          return Effect.fail(
            makeGitCommandError(resolveObjectOperation, objectVerification),
          );
        }

        const objectId = parseGitObjectId(objectVerification.stdout);
        if (objectId === undefined) {
          return Effect.fail(
            new GitInvalidOutputError({
              operation: resolveObjectOperation,
              outputBytes: Buffer.byteLength(objectVerification.stdout),
            }),
          );
        }

        return executeGit(
          runner,
          inspectObjectOperation,
          ["cat-file", "-s", objectId],
          { maxOutputBytes: gitObjectMetadataMaxOutputBytes, workingDirectory },
        ).pipe(
          Effect.flatMap((sizeResult): Effect.Effect<bigint, GitError> => {
            if (sizeResult.exitCode !== 0) {
              return Effect.fail(
                makeGitCommandError(inspectObjectOperation, sizeResult),
              );
            }

            const size = sizeResult.stdout.trim();
            return /^\d+$/.test(size)
              ? Effect.succeed(BigInt(size))
              : Effect.fail(
                  new GitInvalidOutputError({
                    operation: inspectObjectOperation,
                    outputBytes: Buffer.byteLength(sizeResult.stdout),
                  }),
                );
          }),
        );
      },
    ),
  );
};
