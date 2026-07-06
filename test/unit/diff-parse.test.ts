import { describe, expect, it } from "vitest"

import { parseUnifiedDiff } from "../../src/git/diff-parse.ts"

const MODIFIED_DIFF = `diff --git a/src/user.ts b/src/user.ts
index 111..222 100644
--- a/src/user.ts
+++ b/src/user.ts
@@ -1,8 +1,12 @@
 export interface User { id: string; email?: string }

+const ADMIN_TOKEN = "sk-prod"
+
 export function domainOf(user: User): string {
-  return user.email ? user.email.split("@")[1] : ""
+  return user.email.split("@")[1].toLowerCase()
 }
+
+export function isAdmin(token: string): boolean {
+  return token == ADMIN_TOKEN
+}
`

const NEW_FILE_DIFF = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 000..111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export const a = 1
+export const b = 2
+export const c = 3
`

const RENAME_DIFF = `diff --git a/src/old.ts b/src/renamed.ts
similarity index 90%
rename from src/old.ts
rename to src/renamed.ts
index 111..222 100644
--- a/src/old.ts
+++ b/src/renamed.ts
@@ -5,3 +5,4 @@
 line
 line
 line
+added line
`

describe("parseUnifiedDiff", () => {
  it("parses a modified file with correct added line numbers", () => {
    const files = parseUnifiedDiff(MODIFIED_DIFF)
    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe("src/user.ts")
    expect(files[0]?.status).toBe("modified")
    // 新檔行號：3(ADMIN_TOKEN), 4(空行), 6(return...), 8(空行), 9,10,11(isAdmin)
    expect(files[0]?.hunks[0]?.addedLines).toEqual([3, 4, 6, 8, 9, 10, 11])
  })

  it("parses a new file", () => {
    const files = parseUnifiedDiff(NEW_FILE_DIFF)
    expect(files[0]?.path).toBe("src/new.ts")
    expect(files[0]?.status).toBe("added")
    expect(files[0]?.hunks[0]?.addedLines).toEqual([1, 2, 3])
  })

  it("parses a rename with the new path", () => {
    const files = parseUnifiedDiff(RENAME_DIFF)
    expect(files[0]?.path).toBe("src/renamed.ts")
    expect(files[0]?.status).toBe("renamed")
    expect(files[0]?.hunks[0]?.addedLines).toEqual([8])
  })

  it("parses multiple files", () => {
    const files = parseUnifiedDiff(MODIFIED_DIFF + NEW_FILE_DIFF)
    expect(files.map((file) => file.path)).toEqual(["src/user.ts", "src/new.ts"])
  })

  it("returns empty for empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([])
  })
})
