import { createSignal, createMemo } from "solid-js"
import type { FileDiff, Hunk } from "../core/diff"

export function useDiffNavigation(files: () => FileDiff[]) {
  const [selectedFileIndex, setSelectedFileIndex] = createSignal(0)
  const [selectedHunkIndex, setSelectedHunkIndex] = createSignal(0)
  const [viewMode, setViewMode] = createSignal<"unified" | "split">("unified")

  const selectedFile = createMemo(() => {
    const f = files()
    const idx = selectedFileIndex()
    return f[idx] ?? null
  })

  const selectedHunk = createMemo((): Hunk | null => {
    const file = selectedFile()
    if (!file) return null
    const idx = selectedHunkIndex()
    return file.hunks[idx] ?? null
  })

  const nextFile = () => {
    const f = files()
    if (f.length === 0) return
    setSelectedFileIndex((i) => Math.min(i + 1, f.length - 1))
    setSelectedHunkIndex(0)
  }

  const prevFile = () => {
    setSelectedFileIndex((i) => Math.max(i - 1, 0))
    setSelectedHunkIndex(0)
  }

  const nextHunk = () => {
    const file = selectedFile()
    if (!file) return
    setSelectedHunkIndex((i) => Math.min(i + 1, file.hunks.length - 1))
  }

  const prevHunk = () => {
    setSelectedHunkIndex((i) => Math.max(i - 1, 0))
  }

  const toggleViewMode = () => {
    setViewMode((m) => (m === "unified" ? "split" : "unified"))
  }

  const selectFile = (index: number) => {
    setSelectedFileIndex(index)
    setSelectedHunkIndex(0)
  }

  return {
    selectedFileIndex,
    selectedHunkIndex,
    selectedFile,
    selectedHunk,
    viewMode,
    nextFile,
    prevFile,
    nextHunk,
    prevHunk,
    toggleViewMode,
    selectFile,
  }
}
