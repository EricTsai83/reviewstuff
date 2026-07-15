import { Effect } from "effect";
import type { Finding } from "../domain/finding";
import type { ReviewReport } from "../domain/report";
import type { ReviewScope } from "../domain/scope";
import {
  type GitError,
  type GitFilePatch,
  GitService,
} from "../git/git-service";

const marker = "REVIEWSTUFF_FAKE_FINDING";

const stableHash = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const findingsForPatch = (file: GitFilePatch): ReadonlyArray<Finding> => {
  const findings: Array<Finding> = [];
  let newLine = 0;

  for (const line of file.patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

    if (hunk !== null) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (line.includes(marker)) {
        findings.push({
          id: `fake-marker:${file.path}:${newLine}:${stableHash(line.slice(1))}`,
          ruleId: "fake-marker",
          severity: "warning",
          message: "Deterministic fake finding marker detected.",
          file: file.path,
          line: newLine,
        });
      }

      newLine += 1;
      continue;
    }

    if (!line.startsWith("-") && !line.startsWith("\\")) {
      newLine += 1;
    }
  }

  return findings;
};

export const runReview = (
  scope: ReviewScope,
): Effect.Effect<ReviewReport, GitError, GitService> =>
  Effect.gen(function* () {
    const git = yield* GitService;
    const diff = yield* git.readDiff(scope);
    const findings = diff.files.flatMap(findingsForPatch);
    const changedFiles = new Set(diff.files.map((file) => file.path)).size;

    return {
      schemaVersion: 1,
      scope,
      summary: {
        changedFiles,
        findings: findings.length,
      },
      findings,
    };
  });
