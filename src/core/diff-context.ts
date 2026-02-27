import { createSignal } from "solid-js"
import type { FileDiff, Hunk } from "./diff"

export interface DiffContextState {
  files: FileDiff[]
  source: string
}

const [diffContext, setDiffContext] = createSignal<DiffContextState | null>(null)
const [contextEnabled, setContextEnabled] = createSignal(true)

export function updateDiffContext(files: FileDiff[], source: string) {
  setDiffContext({ files, source })
}

export function clearDiffContext() {
  setDiffContext(null)
}

export function toggleDiffContext() {
  setContextEnabled((v) => !v)
}

export function isDiffContextEnabled() {
  return contextEnabled()
}

export function getDiffContext() {
  return diffContext()
}

export function getDiffContextSummary(): string | null {
  if (!contextEnabled()) return null

  const ctx = diffContext()
  if (!ctx || ctx.files.length === 0) return null

  return `${ctx.files.length} file${ctx.files.length === 1 ? "" : "s"} (${ctx.source})`
}

function formatHunkRanges(hunks: Hunk[]): string {
  return hunks
    .map((h) => `L${h.newStart}-${h.newStart + h.newCount - 1}`)
    .join(", ")
}

export function formatDiffContextForAgent(): string | null {
  if (!contextEnabled()) return null

  const ctx = diffContext()
  if (!ctx || ctx.files.length === 0) return null

  const lines: string[] = [
    `<diff_context source="${ctx.source}">`,
    `Changed files:`,
  ]

  for (const file of ctx.files) {
    const stat = `+${file.additions}/-${file.deletions}`
    const ranges = file.hunks.length > 0 ? ` (${formatHunkRanges(file.hunks)})` : ""
    lines.push(`  ${file.status.charAt(0).toUpperCase()} ${file.newPath} ${stat}${ranges}`)
  }

  lines.push(`</diff_context>`)
  return lines.join("\n")
}
