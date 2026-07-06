import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { GitError, NotARepository } from "../domain/errors.ts"
import type { ReviewScope } from "../domain/scope.ts"
import { runCommand } from "../shared/exec.ts"

export interface GitServiceShape {
  /** repo 根目錄；不在 git repo 裡 → NotARepository */
  readonly repoRoot: Effect.Effect<string, NotARepository | GitError>
  /** 該範圍的 unified diff 全文 */
  readonly diffFor: (
    scope: ReviewScope,
    fileGlobs?: readonly string[]
  ) => Effect.Effect<string, GitError>
  /** 該範圍變更的檔案清單 */
  readonly changedFiles: (
    scope: ReviewScope,
    fileGlobs?: readonly string[]
  ) => Effect.Effect<readonly string[], GitError>
}

export class GitService extends Context.Service<GitService, GitServiceShape>()("GitService") {}

const diffArgs = (scope: ReviewScope): string[] => {
  switch (scope._tag) {
    case "Staged":
      return ["diff", "--staged"]
    case "Since":
      return ["diff", `${scope.ref}...HEAD`]
    case "WorkingTree":
      return ["diff", "HEAD"]
  }
}

const git = (args: readonly string[]) =>
  runCommand("git", args).pipe(
    Effect.mapError((error) => new GitError({ message: `git ${args.join(" ")} 無法執行`, cause: error.cause }))
  )

const gitOk = (args: readonly string[]) =>
  git(args).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout)
        : Effect.fail(
            new GitError({ message: `git ${args.join(" ")} 失敗（exit ${result.exitCode}）：${result.stderr.trim()}` })
          )
    )
  )

const withGlobs = (args: string[], fileGlobs?: readonly string[]): string[] =>
  fileGlobs && fileGlobs.length > 0 ? [...args, "--", ...fileGlobs] : args

export const GitServiceLive = Layer.succeed(GitService, {
  repoRoot: git(["rev-parse", "--show-toplevel"]).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout.trim())
        : Effect.fail(new NotARepository({ cwd: process.cwd() }))
    )
  ),

  diffFor: (scope, fileGlobs) => gitOk(withGlobs(diffArgs(scope), fileGlobs)),

  changedFiles: (scope, fileGlobs) =>
    gitOk(withGlobs([...diffArgs(scope), "--name-only"], fileGlobs)).pipe(
      Effect.map((stdout) => stdout.split("\n").map((line) => line.trim()).filter(Boolean))
    )
})
