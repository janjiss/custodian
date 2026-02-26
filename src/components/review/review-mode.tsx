import { createSignal, createEffect, onMount } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useGitDiff, type DiffSource } from "../../hooks/use-git"
import { useDiffNavigation } from "../../hooks/use-diff"
import { GitService } from "../../core/git"
import { SplitPane } from "../layout/split-pane"
import { FileTree } from "./file-tree"
import { DiffViewer } from "./diff-viewer"
import { ReviewToolbar } from "./review-toolbar"

export const ReviewMode = () => {
  const [diffSource, setDiffSource] = createSignal<DiffSource>({ type: "working" })
  const { diffs, loading, error, fetchDiff } = useGitDiff(diffSource)
  const nav = useDiffNavigation(diffs)

  onMount(() => {
    fetchDiff()
  })

  createEffect(() => {
    diffSource()
    fetchDiff()
  })

  useKeyboard((key) => {
    if (key.ctrl || key.meta) return

    switch (key.name) {
      case "j":
      case "down":
        nav.nextFile()
        break
      case "k":
      case "up":
        nav.prevFile()
        break
      case "n":
        nav.nextHunk()
        break
      case "N":
        nav.prevHunk()
        break
      case "u":
        nav.toggleViewMode()
        break
      case "a":
        handleAccept()
        break
      case "r":
        handleReject()
        break
      case "s":
        handleToggleStaged()
        break
      case "R":
        fetchDiff()
        break
      case "w":
        setDiffSource({ type: "working" })
        break
      case "S":
        setDiffSource({ type: "staged" })
        break
    }
  })

  const handleAccept = async () => {
    const file = nav.selectedFile()
    if (!file) return
    try {
      await GitService.stage(file.newPath)
      fetchDiff()
    } catch {}
  }

  const handleReject = async () => {
    const file = nav.selectedFile()
    if (!file) return
    try {
      await GitService.checkout(file.newPath)
      fetchDiff()
    } catch {}
  }

  const handleToggleStaged = async () => {
    const file = nav.selectedFile()
    if (!file) return
    try {
      const source = diffSource()
      if (source.type === "staged") {
        await GitService.unstage(file.newPath)
      } else {
        await GitService.stage(file.newPath)
      }
      fetchDiff()
    } catch {}
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} bg="#1a1a2e">
        <text fg="#87CEEB" bold> Review </text>
        <text
          fg={diffSource().type === "working" ? "#FFFFFF" : "#666666"}
        >
          {" "}[w]orking{" "}
        </text>
        <text
          fg={diffSource().type === "staged" ? "#FFFFFF" : "#666666"}
        >
          {" "}[S]taged{" "}
        </text>
        <text fg="#888888">
          {loading() ? " loading..." : ` ${diffs().length} files`}
        </text>
      </box>
      <SplitPane
        leftWidth="30%"
        left={
          <FileTree
            files={diffs()}
            selectedIndex={nav.selectedFileIndex()}
            onSelect={nav.selectFile}
          />
        }
        right={
          <DiffViewer
            file={nav.selectedFile()}
            viewMode={nav.viewMode()}
            selectedHunkIndex={nav.selectedHunkIndex()}
          />
        }
      />
      <ReviewToolbar
        file={nav.selectedFile()}
        onAccept={handleAccept}
        onReject={handleReject}
        onToggleStaged={handleToggleStaged}
      />
    </box>
  )
}
