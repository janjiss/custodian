import { createSignal, createResource, onCleanup } from "solid-js"
import { GitService, type GitFileStatus, type GitBranch } from "../core/git"
import { parseDiff, type FileDiff } from "../core/diff"

export interface DiffSource {
  type: "working" | "staged" | "branch" | "commits"
  ref1?: string
  ref2?: string
}

export function useGitStatus() {
  const [trigger, setTrigger] = createSignal(0)

  const [status] = createResource(trigger, async () => {
    try {
      return await GitService.status()
    } catch {
      return [] as GitFileStatus[]
    }
  })

  const refresh = () => setTrigger((n) => n + 1)

  const interval = setInterval(refresh, 3000)
  onCleanup(() => clearInterval(interval))

  return { status, refresh }
}

export function useGitDiff(source: () => DiffSource) {
  const [diffs, setDiffs] = createSignal<FileDiff[]>([])
  const [stagedDiffs, setStagedDiffs] = createSignal<FileDiff[]>([])
  const [workingDiffs, setWorkingDiffs] = createSignal<FileDiff[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const fetchDiff = async () => {
    setLoading(true)
    setError(null)
    try {
      const s = source()
      let raw: string

      switch (s.type) {
        case "staged":
          raw = await GitService.diff({ staged: true })
          setStagedDiffs(parseDiff(raw))
          setWorkingDiffs([])
          break
        case "branch":
          raw = await GitService.diff({ ref1: s.ref1, ref2: s.ref2 })
          setDiffs(parseDiff(raw))
          break
        case "commits":
          raw = await GitService.diff({ ref1: s.ref1, ref2: s.ref2 })
          setDiffs(parseDiff(raw))
          break
        case "working":
        default:
          const [stagedRaw, workingRaw] = await Promise.all([
            GitService.diff({ staged: true }),
            GitService.diff(),
          ])
          setStagedDiffs(parseDiff(stagedRaw))
          setWorkingDiffs(parseDiff(workingRaw))
          break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDiffs([])
      setStagedDiffs([])
      setWorkingDiffs([])
    } finally {
      setLoading(false)
    }
  }

  return { diffs, stagedDiffs, workingDiffs, loading, error, fetchDiff }
}

export function useGitBranches() {
  const [branches] = createResource(async () => {
    try {
      return await GitService.branches()
    } catch {
      return [] as GitBranch[]
    }
  })

  const [currentBranch] = createResource(async () => {
    try {
      return await GitService.currentBranch()
    } catch {
      return "unknown"
    }
  })

  return { branches, currentBranch }
}
