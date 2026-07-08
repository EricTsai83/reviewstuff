import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/** 建一個 tmp git repo：base commit 乾淨，之後種入 bug 並 stage。 */
export interface FixtureRepo {
  readonly root: string
  readonly cleanup: () => void
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } })

export const makeFixtureRepo = (): FixtureRepo => {
  const root = mkdtempSync(path.join(os.tmpdir(), "reviewstuff-e2e-"))

  git(root, "init", "-b", "main")
  git(root, "config", "user.email", "test@example.com")
  git(root, "config", "user.name", "test")

  mkdirSync(path.join(root, "src"), { recursive: true })
  writeFileSync(
    path.join(root, "src", "user.ts"),
    `export interface User { id: string; email?: string }

export function domainOf(user: User): string {
  return user.email ? (user.email.split("@")[1] ?? "") : ""
}
`
  )
  git(root, "add", ".")
  git(root, "commit", "-m", "base")

  // 種入 bug：hardcoded secret + 移除 null check
  writeFileSync(
    path.join(root, "src", "user.ts"),
    `export interface User { id: string; email?: string }

const ADMIN_TOKEN = "sk-prod-9f8e7d6c5b4a"

export function domainOf(user: User): string {
  return user.email!.split("@")[1]!.toLowerCase()
}

export function isAdmin(token: string): boolean {
  return token == ADMIN_TOKEN
}
`
  )
  git(root, "add", ".")

  return {
    root,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true })
    }
  }
}
