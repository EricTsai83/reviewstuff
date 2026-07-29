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

export interface ParsedDiffRecord {
  readonly fileHeader: string;
  readonly hunks: ReadonlyArray<GitDiffHunk>;
  readonly binary: boolean;
  /** Exact record text, including its file header, terminated by a newline. */
  readonly patch: string;
  /**
   * Path the record reports a change for: the post-image path, or the
   * pre-image path when the record deletes the file. `undefined` when the
   * record carries no path shape this parser can attribute, which keeps
   * attribution explicit instead of guessing.
   */
  readonly path: string | undefined;
}

const recordMarker = "diff --git ";
const hunkHeaderPattern =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/u;
const noNewlineMarker = "\\ No newline at end of file";
const devNull = "/dev/null";
const octalEscapePattern = /^[0-7]{3}$/;
const quoteByte = 0x22;
const backslashByte = 0x5c;
const simpleEscapeBytes: Readonly<Record<string, number>> = {
  '"': 0x22,
  "\\": 0x5c,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
};

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

/**
 * Reverses the C-style quoting Git applies to paths that contain quotes,
 * backslashes or control bytes. Unquoted tokens are returned unchanged.
 */
const unquotePath = (token: string): string | undefined => {
  if (!token.startsWith('"')) {
    return token;
  }
  if (token.length < 2 || !token.endsWith('"')) {
    return undefined;
  }

  const source = Buffer.from(token.slice(1, -1), "utf8");
  const bytes: Array<number> = [];

  for (let index = 0; index < source.length; index += 1) {
    const byte = source[index];
    if (byte === undefined || byte === quoteByte) {
      return undefined;
    }
    if (byte !== backslashByte) {
      bytes.push(byte);
      continue;
    }

    const escaped = source[index + 1];
    if (escaped === undefined) {
      return undefined;
    }

    const simple = simpleEscapeBytes[String.fromCharCode(escaped)];
    if (simple !== undefined) {
      bytes.push(simple);
      index += 1;
      continue;
    }

    const octal = source.toString("latin1", index + 1, index + 4);
    if (!octalEscapePattern.test(octal)) {
      return undefined;
    }
    bytes.push(Number.parseInt(octal, 8));
    index += 3;
  }

  return Buffer.from(bytes).toString("utf8");
};

const prefixedPath = (
  token: string,
  prefix: "a/" | "b/",
): string | undefined => {
  if (token === devNull) {
    return undefined;
  }

  const unquoted = unquotePath(token);
  return unquoted !== undefined && unquoted.startsWith(prefix)
    ? unquoted.slice(prefix.length)
    : undefined;
};

const lineValue = (
  lines: ReadonlyArray<string>,
  prefix: string,
): string | undefined => {
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line === undefined ? undefined : line.slice(prefix.length);
};

const sidePath = (
  lines: ReadonlyArray<string>,
  side: "old" | "new",
): string | undefined => {
  const contentHeader = lineValue(lines, side === "old" ? "--- " : "+++ ");
  if (contentHeader !== undefined) {
    // Git terminates a content header with a tab when the path contains a
    // space. A path that itself ends with a tab is quoted, so the escaped tab
    // stays inside the quotes and only the separator is removed here.
    const value = contentHeader.endsWith("\t")
      ? contentHeader.slice(0, -1)
      : contentHeader;

    return prefixedPath(value, side === "old" ? "a/" : "b/");
  }

  const renameOrCopy = lineValue(
    lines,
    side === "old" ? "rename from " : "rename to ",
  ) ??
    lineValue(lines, side === "old" ? "copy from " : "copy to ");
  if (renameOrCopy !== undefined) {
    return unquotePath(renameOrCopy);
  }

  // A record without content or rename headers, such as a mode-only change,
  // keeps both sides at one path, which Git prints as `a/<path> b/<path>`.
  const marker = lines[0]?.slice(recordMarker.length) ?? "";
  if ((marker.length - 5) % 2 !== 0) {
    return undefined;
  }
  const pathLength = (marker.length - 5) / 2;
  const path = marker.slice(2, 2 + pathLength);

  return pathLength > 0 && marker === `a/${path} b/${path}` ? path : undefined;
};

const recordPath = (lines: ReadonlyArray<string>): string | undefined =>
  sidePath(lines, "new") ?? sidePath(lines, "old");

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

const metadataPairs = [
  ["old mode ", "new mode "],
  ["rename from ", "rename to "],
  ["copy from ", "copy to "],
] as const;

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

const parseRecord = (
  lines: ReadonlyArray<string>,
  operation: string,
  output: string,
): Effect.Effect<ParsedDiffRecord, GitInvalidOutputError> => {
  const patch = `${lines.join("\n")}\n`;
  const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@"));
  // Hunk content can start with `--- ` or `+++ `, so paths are only read from
  // the record's header lines.
  const path = recordPath(
    firstHunkIndex === -1 ? lines : lines.slice(0, firstHunkIndex),
  );
  const binary = lines.some((line) =>
    line.startsWith("Binary files ") || line === "GIT binary patch"
  );
  if (binary) {
    return Effect.succeed({
      fileHeader: patch,
      hunks: [],
      binary: true,
      patch,
      path,
    });
  }

  if (firstHunkIndex === -1) {
    return validateFileHeader(lines, false)
      ? Effect.succeed({
        fileHeader: patch,
        hunks: [],
        binary: false,
        patch,
        path,
      })
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
      patch,
      path,
    })),
  );
};

/**
 * Parses Git patch output into one record per `diff --git` boundary.
 *
 * A pathspec-limited diff can legitimately describe more than one record, so
 * callers select the records that belong to the file they asked for.
 */
export const parseUnifiedDiff = (
  output: string,
  operation: string,
): Effect.Effect<ReadonlyArray<ParsedDiffRecord>, GitInvalidOutputError> => {
  if (!output.endsWith("\n")) {
    return Effect.fail(invalidOutput(operation, output));
  }

  const lines = output.slice(0, -1).split("\n");
  if (!lines[0]?.startsWith(recordMarker)) {
    return Effect.fail(invalidOutput(operation, output));
  }

  const recordStarts = lines.flatMap((line, index) =>
    line.startsWith(recordMarker) ? [index] : []
  );

  return Effect.forEach(recordStarts, (start, index) =>
    parseRecord(
      lines.slice(start, recordStarts[index + 1] ?? lines.length),
      operation,
      output,
    )
  );
};
