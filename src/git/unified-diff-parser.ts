import * as Effect from "effect/Effect";
import { GitInvalidOutputError } from "./git-errors";

export interface GitDiffHunk {
  readonly header: string;
  readonly oldStartLine: number;
  readonly oldLineCount: number;
  readonly newStartLine: number;
  readonly newLineCount: number;
  readonly patch: string;
}

export interface ParsedUnifiedDiff {
  readonly fileHeader: string;
  readonly hunks: ReadonlyArray<GitDiffHunk>;
  readonly binary: boolean;
}

const hunkHeaderPattern =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/u;
const noNewlineMarker = "\\ No newline at end of file";
const metadataPairs = [
  ["old mode ", "new mode "],
  ["rename from ", "rename to "],
  ["copy from ", "copy to "],
] as const;

const invalidOutput = (
  operation: string,
  output: string,
): GitInvalidOutputError =>
  new GitInvalidOutputError({
    operation,
    outputBytes: Buffer.byteLength(output),
  });

const parseInteger = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const parseHunk = (
  lines: ReadonlyArray<string>,
  operation: string,
  output: string,
): Effect.Effect<GitDiffHunk, GitInvalidOutputError> => {
  const header = lines[0];
  const match = header?.match(hunkHeaderPattern);
  if (header === undefined || match === undefined || match === null) {
    return Effect.fail(invalidOutput(operation, output));
  }

  const oldStartLine = parseInteger(match[1] ?? "");
  const oldLineCount = parseInteger(match[2] ?? "1");
  const newStartLine = parseInteger(match[3] ?? "");
  const newLineCount = parseInteger(match[4] ?? "1");
  if (
    oldStartLine === undefined ||
    oldLineCount === undefined ||
    newStartLine === undefined ||
    newLineCount === undefined ||
    oldStartLine < (oldLineCount === 0 ? 0 : 1) ||
    newStartLine < (newLineCount === 0 ? 0 : 1)
  ) {
    return Effect.fail(invalidOutput(operation, output));
  }

  let observedOldLines = 0;
  let observedNewLines = 0;
  let previousWasContent = false;

  for (const line of lines.slice(1)) {
    if (line === noNewlineMarker) {
      if (!previousWasContent) {
        return Effect.fail(invalidOutput(operation, output));
      }
      previousWasContent = false;
      continue;
    }

    const prefix = line[0];
    if (prefix === " ") {
      observedOldLines += 1;
      observedNewLines += 1;
    } else if (prefix === "-") {
      observedOldLines += 1;
    } else if (prefix === "+") {
      observedNewLines += 1;
    } else {
      return Effect.fail(invalidOutput(operation, output));
    }
    previousWasContent = true;
  }

  if (
    observedOldLines !== oldLineCount ||
    observedNewLines !== newLineCount
  ) {
    return Effect.fail(invalidOutput(operation, output));
  }

  return Effect.succeed({
    header,
    oldStartLine,
    oldLineCount,
    newStartLine,
    newLineCount,
    patch: `${lines.join("\n")}\n`,
  });
};

const countLinesStartingWith = (
  lines: ReadonlyArray<string>,
  prefix: string,
): number => lines.filter((line) => line.startsWith(prefix)).length;

const validateFileHeader = (
  lines: ReadonlyArray<string>,
  hasHunks: boolean,
): boolean => {
  const sourceHeaders = countLinesStartingWith(lines, "--- ");
  const targetHeaders = countLinesStartingWith(lines, "+++ ");
  if (
    hasHunks
      ? sourceHeaders !== 1 || targetHeaders !== 1
      : sourceHeaders !== 0 || targetHeaders !== 0
  ) {
    return false;
  }

  const pairCounts = metadataPairs.map(([left, right]) => [
    countLinesStartingWith(lines, left),
    countLinesStartingWith(lines, right),
  ] as const);
  if (pairCounts.some(([left, right]) => left !== right || left > 1)) {
    return false;
  }

  if (hasHunks) {
    return true;
  }

  const hasCompletePair = pairCounts.some(([left]) => left === 1);
  const hasIndex = countLinesStartingWith(lines, "index ") === 1;
  const hasEmptyFileChange = hasIndex &&
    (countLinesStartingWith(lines, "new file mode ") === 1 ||
      countLinesStartingWith(lines, "deleted file mode ") === 1);
  return hasCompletePair || hasEmptyFileChange;
};

export const parseUnifiedDiff = (
  output: string,
  operation: string,
): Effect.Effect<ParsedUnifiedDiff, GitInvalidOutputError> => {
  if (!output.endsWith("\n")) {
    return Effect.fail(invalidOutput(operation, output));
  }

  const lines = output.slice(0, -1).split("\n");
  if (
    !lines[0]?.startsWith("diff --git ") ||
    lines.slice(1).some((line) => line.startsWith("diff --git "))
  ) {
    return Effect.fail(invalidOutput(operation, output));
  }

  const binary = lines.some((line) =>
    line.startsWith("Binary files ") || line === "GIT binary patch"
  );
  if (binary) {
    return Effect.succeed({ fileHeader: output, hunks: [], binary: true });
  }

  const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@"));
  if (firstHunkIndex === -1) {
    return validateFileHeader(lines, false)
      ? Effect.succeed({ fileHeader: output, hunks: [], binary: false })
      : Effect.fail(invalidOutput(operation, output));
  }

  const fileHeaderLines = lines.slice(0, firstHunkIndex);
  if (!validateFileHeader(fileHeaderLines, true)) {
    return Effect.fail(invalidOutput(operation, output));
  }

  const hunkStarts = lines
    .map((line, index) => line.startsWith("@@") ? index : -1)
    .filter((index) => index >= firstHunkIndex);

  return Effect.forEach(hunkStarts, (start, index) => {
    const end = hunkStarts[index + 1] ?? lines.length;
    return parseHunk(lines.slice(start, end), operation, output);
  }).pipe(
    Effect.map((hunks) => ({
      fileHeader: `${fileHeaderLines.join("\n")}\n`,
      hunks,
      binary: false,
    })),
  );
};
