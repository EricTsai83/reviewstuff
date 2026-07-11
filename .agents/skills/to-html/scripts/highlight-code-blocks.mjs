#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"

const target = process.argv[2]

if (!target) {
  console.error("Usage: highlight-code-blocks.mjs <path-to-html>")
  process.exit(1)
}

const filePath = path.resolve(target)
let html = fs.readFileSync(filePath, "utf8")

const decodeHtml = (value) =>
  value
    .replace(/<span class="[^"]+">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

const span = (className, value) => `<span class="${className}">${escapeHtml(value)}</span>`

const keywords = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "of",
  "return",
  "satisfies",
  "switch",
  "throw",
  "true",
  "try",
  "type",
  "undefined",
  "while",
  "yield"
])

const literals = new Set(["true", "false", "null", "undefined"])

const highlightTypeScript = (code) => {
  let output = ""
  let index = 0
  let previousNonSpace = ""

  const isIdentifierStart = (char) => /[A-Za-z_$]/.test(char)
  const isIdentifier = (char) => /[A-Za-z0-9_$]/.test(char)
  const nextNonSpace = (position) => {
    while (position < code.length && /\s/.test(code[position])) position += 1
    return code[position] ?? ""
  }
  const emit = (value) => {
    output += escapeHtml(value)
    if (value.trim()) previousNonSpace = value.trim().at(-1) ?? previousNonSpace
  }
  const emitSpan = (className, value) => {
    output += span(className, value)
    if (value.trim()) previousNonSpace = value.trim().at(-1) ?? previousNonSpace
  }

  while (index < code.length) {
    const char = code[index]
    const pair = code.slice(index, index + 2)

    if (pair === "//") {
      const nextLine = code.indexOf("\n", index)
      const end = nextLine === -1 ? code.length : nextLine
      emitSpan("c", code.slice(index, end))
      index = end
      continue
    }

    if (pair === "/*") {
      const close = code.indexOf("*/", index + 2)
      const end = close === -1 ? code.length : close + 2
      emitSpan("c", code.slice(index, end))
      index = end
      continue
    }

    if (char === "\"" || char === "'" || char === "`") {
      const quote = char
      let end = index + 1
      while (end < code.length) {
        if (code[end] === "\\") {
          end += 2
          continue
        }
        if (code[end] === quote) {
          end += 1
          break
        }
        end += 1
      }
      emitSpan("s", code.slice(index, end))
      index = end
      continue
    }

    if (/\d/.test(char)) {
      let end = index + 1
      while (end < code.length && /[\d._]/.test(code[end])) end += 1
      emitSpan("n", code.slice(index, end))
      index = end
      continue
    }

    if (isIdentifierStart(char)) {
      let end = index + 1
      while (end < code.length && isIdentifier(code[end])) end += 1
      const word = code.slice(index, end)
      const next = nextNonSpace(end)

      if (literals.has(word)) emitSpan("n", word)
      else if (keywords.has(word)) emitSpan("k", word)
      else if (previousNonSpace === ".") emitSpan("p", word)
      else if (next === "(") emitSpan("f", word)
      else if (/^[A-Z]/.test(word)) emitSpan("t", word)
      else emit(word)

      index = end
      continue
    }

    if (/[{}()[\].,:;?=><+\-*|&!]/.test(char)) {
      emitSpan("o", char)
      index += 1
      continue
    }

    emit(char)
    index += 1
  }

  return output
}

const highlightShell = (code) =>
  escapeHtml(code).replace(/(^|\s)(--?[A-Za-z0-9-]+)/g, (_match, leading, flag) => {
    return `${leading}${span("p", flag)}`
  })

html = html.replace(
  /<pre><span class="label">([^<]+)<\/span><code>([\s\S]*?)<\/code><\/pre>/g,
  (_match, label, codeHtml) => {
    const raw = decodeHtml(codeHtml)
    const normalizedLabel = label.toLowerCase()
    const highlighted = normalizedLabel.includes("typescript") || normalizedLabel.includes("javascript")
      ? highlightTypeScript(raw)
      : normalizedLabel.includes("shell") || normalizedLabel.includes("bash")
        ? highlightShell(raw)
        : escapeHtml(raw)

    return `<pre><span class="label">${label}</span><code>${highlighted}</code></pre>`
  }
)

fs.writeFileSync(filePath, html)
