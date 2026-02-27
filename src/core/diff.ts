export type LineType = "context" | "add" | "remove" | "header"

export interface DiffLine {
  type: LineType
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface Hunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export interface FileDiff {
  oldPath: string
  newPath: string
  status: "added" | "modified" | "deleted" | "renamed"
  hunks: Hunk[]
  additions: number
  deletions: number
  isBinary: boolean
  rawDiff: string
}

const DIFF_HEADER_RE = /^diff --git \w\/(.+) \w\/(.+)$/
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/
const RENAME_FROM_RE = /^rename from (.+)$/
const RENAME_TO_RE = /^rename to (.+)$/
const NEW_FILE_RE = /^new file mode/
const DELETED_FILE_RE = /^deleted file mode/
const BINARY_RE = /^Binary files/

export function parseDiff(raw: string): FileDiff[] {
  if (!raw.trim()) return []

  const lines = raw.split("\n")
  const files: FileDiff[] = []
  let current: FileDiff | null = null
  let currentHunk: Hunk | null = null
  let oldLine = 0
  let newLine = 0
  let fileStartLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const headerMatch = line.match(DIFF_HEADER_RE)
    if (headerMatch) {
      if (current) {
        current.rawDiff = lines.slice(fileStartLine, i).join("\n")
        files.push(current)
      }
      fileStartLine = i
      current = {
        oldPath: headerMatch[1],
        newPath: headerMatch[2],
        status: "modified",
        hunks: [],
        additions: 0,
        deletions: 0,
        isBinary: false,
        rawDiff: "",
      }
      currentHunk = null
      continue
    }

    if (!current) continue

    if (NEW_FILE_RE.test(line)) {
      current.status = "added"
      continue
    }

    if (DELETED_FILE_RE.test(line)) {
      current.status = "deleted"
      continue
    }

    const renameFrom = line.match(RENAME_FROM_RE)
    if (renameFrom) {
      current.status = "renamed"
      current.oldPath = renameFrom[1]
      continue
    }

    const renameTo = line.match(RENAME_TO_RE)
    if (renameTo) {
      current.newPath = renameTo[1]
      continue
    }

    if (BINARY_RE.test(line)) {
      current.isBinary = true
      continue
    }

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue
    }

    const hunkMatch = line.match(HUNK_RE)
    if (hunkMatch) {
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] ?? "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] ?? "1", 10),
        lines: [],
      }
      oldLine = currentHunk.oldStart
      newLine = currentHunk.newStart
      current.hunks.push(currentHunk)
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        newLineNumber: newLine++,
      })
      current.additions++
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "remove",
        content: line.slice(1),
        oldLineNumber: oldLine++,
      })
      current.deletions++
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      })
    } else if (line === "\\ No newline at end of file") {
      currentHunk.lines.push({
        type: "context",
        content: line,
      })
    }
  }

  if (current) {
    current.rawDiff = lines.slice(fileStartLine).join("\n")
    files.push(current)
  }

  return files
}

export function formatStats(diff: FileDiff): string {
  return `+${diff.additions} -${diff.deletions}`
}

export function statusChar(status: FileDiff["status"]): string {
  switch (status) {
    case "added":
      return "+"
    case "deleted":
      return "-"
    case "modified":
      return "M"
    case "renamed":
      return "R"
  }
}

export function flattenHunkLines(hunks: Hunk[]): DiffLine[] {
  return hunks.flatMap((h) => [
    { type: "header" as const, content: h.header },
    ...h.lines,
  ])
}

const EXT_TO_FILETYPE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  lua: "lua",
  zig: "zig",
  md: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  html: "html",
  css: "css",
  scss: "css",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  ex: "elixir",
  exs: "elixir",
}

export function filetypeFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase()
  if (!ext) return undefined
  return EXT_TO_FILETYPE[ext]
}
