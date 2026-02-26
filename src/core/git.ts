export interface GitFileStatus {
  path: string
  status: "added" | "modified" | "deleted" | "renamed" | "untracked"
  staged: boolean
  oldPath?: string
}

export interface GitLogEntry {
  hash: string
  shortHash: string
  author: string
  date: string
  message: string
}

export interface GitBranch {
  name: string
  current: boolean
}

export interface DiffOptions {
  staged?: boolean
  ref1?: string
  ref2?: string
  paths?: string[]
}

async function run(args: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: cwd ?? process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (${exitCode}): ${stderr.trim()}`)
  }

  return stdout.trim()
}

function parseStatusLine(line: string): GitFileStatus | null {
  if (line.length < 4) return null

  const index = line[0]
  const worktree = line[1]
  const rest = line.slice(3)

  const renamed = rest.includes(" -> ")
  const [oldPath, newPath] = renamed ? rest.split(" -> ") : [rest, rest]

  if (index === "?" && worktree === "?") {
    return { path: newPath, status: "untracked", staged: false }
  }

  const results: GitFileStatus[] = []

  const charToStatus = (c: string): GitFileStatus["status"] | null => {
    switch (c) {
      case "A":
        return "added"
      case "M":
        return "modified"
      case "D":
        return "deleted"
      case "R":
        return "renamed"
      default:
        return null
    }
  }

  if (index !== " " && index !== "?") {
    const s = charToStatus(index)
    if (s) return { path: newPath, status: s, staged: true, oldPath: renamed ? oldPath : undefined }
  }

  if (worktree !== " " && worktree !== "?") {
    const s = charToStatus(worktree)
    if (s) return { path: newPath, status: s, staged: false, oldPath: renamed ? oldPath : undefined }
  }

  return results[0] ?? null
}

export const GitService = {
  async status(): Promise<GitFileStatus[]> {
    const output = await run(["status", "--porcelain=v1", "-z"])
    if (!output) return []

    const entries = output.split("\0").filter(Boolean)
    const results: GitFileStatus[] = []

    for (const entry of entries) {
      const parsed = parseStatusLine(entry)
      if (parsed) results.push(parsed)
    }

    return results
  },

  async diff(opts: DiffOptions = {}): Promise<string> {
    const args = ["diff", "--no-color"]

    if (opts.staged) args.push("--staged")

    if (opts.ref1 && opts.ref2) {
      args.push(`${opts.ref1}...${opts.ref2}`)
    } else if (opts.ref1) {
      args.push(opts.ref1)
    }

    if (opts.paths?.length) {
      args.push("--", ...opts.paths)
    }

    return run(args)
  },

  async log(count = 20): Promise<GitLogEntry[]> {
    const sep = "<<SEP>>"
    const format = ["%H", "%h", "%an", "%ai", "%s"].join(sep)
    const output = await run(["log", `--format=${format}`, `-${count}`])

    if (!output) return []

    return output.split("\n").map((line) => {
      const [hash, shortHash, author, date, message] = line.split(sep)
      return { hash, shortHash, author, date, message }
    })
  },

  async branches(): Promise<GitBranch[]> {
    const output = await run(["branch", "--no-color"])
    if (!output) return []

    return output.split("\n").map((line) => ({
      name: line.slice(2).trim(),
      current: line.startsWith("*"),
    }))
  },

  async currentBranch(): Promise<string> {
    return run(["rev-parse", "--abbrev-ref", "HEAD"])
  },

  async stage(path: string): Promise<void> {
    await run(["add", "--", path])
  },

  async unstage(path: string): Promise<void> {
    await run(["reset", "HEAD", "--", path])
  },

  async checkout(path: string): Promise<void> {
    await run(["checkout", "--", path])
  },

  async isRepo(): Promise<boolean> {
    try {
      await run(["rev-parse", "--is-inside-work-tree"])
      return true
    } catch {
      return false
    }
  },

  async root(): Promise<string> {
    return run(["rev-parse", "--show-toplevel"])
  },
}
