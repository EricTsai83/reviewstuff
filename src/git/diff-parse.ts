/** 純函式：解析 unified diff。不碰 IO、不碰 Effect。 */

export interface DiffHunk {
  /** 新檔起始行號 */
  readonly newStart: number
  /** hunk 內新增的行（新檔行號） */
  readonly addedLines: readonly number[]
}

export interface DiffFile {
  /** 新檔路徑（rename 取新名） */
  readonly path: string
  readonly status: "added" | "modified" | "deleted" | "renamed"
  readonly hunks: readonly DiffHunk[]
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export const parseUnifiedDiff = (diff: string): DiffFile[] => {
  const files: DiffFile[] = []
  let currentPath: string | null = null
  let currentStatus: DiffFile["status"] = "modified"
  let currentHunks: DiffHunk[] = []
  let hunkNewLine = 0
  let currentAdded: number[] = []
  let inHunk = false

  const flushHunk = () => {
    if (inHunk && currentHunks.length > 0) {
      const last = currentHunks[currentHunks.length - 1]
      if (last) currentHunks[currentHunks.length - 1] = { ...last, addedLines: currentAdded }
    }
    currentAdded = []
    inHunk = false
  }

  const flushFile = () => {
    flushHunk()
    if (currentPath !== null) {
      files.push({ path: currentPath, status: currentStatus, hunks: currentHunks })
    }
    currentPath = null
    currentStatus = "modified"
    currentHunks = []
  }

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flushFile()
      continue
    }
    if (line.startsWith("new file mode")) {
      currentStatus = "added"
      continue
    }
    if (line.startsWith("deleted file mode")) {
      currentStatus = "deleted"
      continue
    }
    if (line.startsWith("rename to ")) {
      currentStatus = "renamed"
      currentPath = line.slice("rename to ".length)
      continue
    }
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim()
      if (target !== "/dev/null") {
        currentPath = target.startsWith("b/") ? target.slice(2) : target
      }
      continue
    }
    if (line.startsWith("--- ")) {
      const source = line.slice(4).trim()
      // deleted file：+++ 是 /dev/null，用舊路徑
      if (currentPath === null && source !== "/dev/null") {
        currentPath = source.startsWith("a/") ? source.slice(2) : source
      }
      continue
    }

    const hunkMatch = HUNK_HEADER.exec(line)
    if (hunkMatch) {
      flushHunk()
      inHunk = true
      hunkNewLine = Number.parseInt(hunkMatch[1] ?? "1", 10)
      currentHunks.push({ newStart: hunkNewLine, addedLines: [] })
      continue
    }

    if (!inHunk) continue

    if (line.startsWith("+")) {
      currentAdded.push(hunkNewLine)
      hunkNewLine += 1
    } else if (line.startsWith("-")) {
      // 舊檔行，不增加新檔行號
    } else {
      hunkNewLine += 1
    }
  }

  flushFile()
  return files
}
