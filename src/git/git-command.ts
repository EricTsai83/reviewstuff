import * as Effect from "effect/Effect";
import * as CommandRunner from "../platform/command-runner";
import {
  GitInvalidOutputError,
  makeGitCommandError,
  mapCommandExecutionError,
  type GitError,
} from "./git-errors";

const gitCommandArguments = ["--literal-pathspecs"] as const;
export const gitCommandTimeoutMilliseconds = 10_000;
export const gitMetadataMaxOutputBytes = 4 * 1024 * 1024;
export const gitObjectMetadataMaxOutputBytes = 1_024;

const isGitObjectId = (value: string): boolean =>
  /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);

export const executeGit = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  maxOutputBytes: number,
  workingDirectory?: string,
) =>
  runner
    .run({
      program: "git",
      args: [...gitCommandArguments, ...args],
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
      environment: { LC_ALL: "C" },
      timeout: gitCommandTimeoutMilliseconds,
      maxOutputBytes,
    })
    .pipe(
      Effect.mapError((cause) => mapCommandExecutionError(operation, cause)),
    );

export const requireGitSuccess = (
  runner: CommandRunner.Service,
  operation: string,
  args: ReadonlyArray<string>,
  workingDirectory?: string,
) =>
  executeGit(
    runner,
    operation,
    args,
    gitMetadataMaxOutputBytes,
    workingDirectory,
  ).pipe(
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
    repositoryRoot,
  ).pipe(
    Effect.flatMap((output) => {
      const emptyTreeObjectId = output.trim();

      return isGitObjectId(emptyTreeObjectId)
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
    gitObjectMetadataMaxOutputBytes,
    workingDirectory,
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

        const objectId = objectVerification.stdout.trim();
        if (!isGitObjectId(objectId)) {
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
          gitObjectMetadataMaxOutputBytes,
          workingDirectory,
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
