import * as Effect from "effect/Effect";
import { GitInvalidOutputError } from "./git-errors";

export type GitChangeStatus =
  | "A"
  | "B"
  | "C"
  | "D"
  | "M"
  | "R"
  | "T"
  | "U"
  | "X";

export interface GitPatchTarget {
  readonly path: string;
  readonly pathspecs: ReadonlyArray<string>;
}

export interface GitChange extends GitPatchTarget {
  readonly status: GitChangeStatus;
  readonly score?: number;
}

const invalidGitOutput = (
  operation: string,
  output: string,
): GitInvalidOutputError =>
  new GitInvalidOutputError({
    operation,
    outputBytes: Buffer.byteLength(output),
  });

const parseNulSeparatedFields = (
  output: string,
  operation: string,
): Effect.Effect<ReadonlyArray<string>, GitInvalidOutputError> => {
  if (output.length === 0) {
    return Effect.succeed([]);
  }

  if (!output.endsWith("\0")) {
    return Effect.fail(invalidGitOutput(operation, output));
  }

  const fields = output.split("\0");
  fields.pop();

  return fields.some((field) => field.length === 0)
    ? Effect.fail(invalidGitOutput(operation, output))
    : Effect.succeed(fields);
};

export const parseNulSeparatedPaths = (
  output: string,
  operation: string,
): Effect.Effect<ReadonlyArray<string>, GitInvalidOutputError> =>
  parseNulSeparatedFields(output, operation).pipe(
    Effect.map((paths) =>
      [...paths].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0
      )
    ),
  );

export const parseChangeStatus = (
  value: string,
): { readonly status: GitChangeStatus; readonly score?: number } | undefined => {
  if (!/^(?:[ABCDTUX]|M(?:\d{3})?|[RC]\d{3})$/.test(value)) {
    return undefined;
  }

  const score = value.length === 4 ? Number(value.slice(1)) : undefined;
  if (score !== undefined && score > 100) {
    return undefined;
  }

  const status = value[0] as GitChangeStatus;
  return score === undefined ? { status } : { status, score };
};

export const parseNulSeparatedChanges = (
  output: string,
  operation: string,
): Effect.Effect<ReadonlyArray<GitChange>, GitInvalidOutputError> =>
  parseNulSeparatedFields(output, operation).pipe(
    Effect.flatMap((fields) => {
      const changes: Array<GitChange> = [];

      for (let index = 0; index < fields.length;) {
        const rawStatus = fields[index];
        const parsedStatus = rawStatus === undefined
          ? undefined
          : parseChangeStatus(rawStatus);
        const sourcePath = fields[index + 1];

        if (parsedStatus === undefined || sourcePath === undefined) {
          return Effect.fail(invalidGitOutput(operation, output));
        }

        if (parsedStatus.status === "R" || parsedStatus.status === "C") {
          const targetPath = fields[index + 2];
          if (targetPath === undefined) {
            return Effect.fail(invalidGitOutput(operation, output));
          }

          changes.push({
            ...parsedStatus,
            path: targetPath,
            pathspecs: [sourcePath, targetPath],
          });
          index += 3;
          continue;
        }

        changes.push({
          ...parsedStatus,
          path: sourcePath,
          pathspecs: [sourcePath],
        });
        index += 2;
      }

      return Effect.succeed(
        changes.sort((left, right) =>
          left.path < right.path ? -1 : left.path > right.path ? 1 : 0
        ),
      );
    }),
  );

export const findUnmergedPaths = (
  changes: ReadonlyArray<GitChange>,
): ReadonlyArray<string> =>
  [...new Set(
    changes
      .filter((change) => change.status === "U")
      .map((change) => change.path),
  )].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

export const mergePatchTargetsByPath = (
  changes: ReadonlyArray<GitChange>,
): ReadonlyArray<GitPatchTarget> => {
  const pathspecsByPath = new Map<string, Set<string>>();

  for (const change of changes) {
    const pathspecs = pathspecsByPath.get(change.path) ?? new Set<string>();
    for (const pathspec of change.pathspecs) {
      pathspecs.add(pathspec);
    }
    pathspecsByPath.set(change.path, pathspecs);
  }

  return [...pathspecsByPath.entries()]
    .map(([path, pathspecs]) => ({ path, pathspecs: [...pathspecs].sort() }))
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    );
};
