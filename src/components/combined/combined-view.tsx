import { createSignal, createEffect, onMount, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useAgent } from "../../hooks/use-agent"
import { useGitDiff, type DiffSource } from "../../hooks/use-git"
import { useDiffNavigation } from "../../hooks/use-diff"
import { SplitPane } from "../layout/split-pane"
import { FileSidebar } from "./file-sidebar"
import { Chat } from "../agent/chat"
import { MessageInput } from "../agent/message-input"
import { DiffViewer } from "../review/diff-viewer"

export const CombinedMode = () => {
  const agent = useAgent()
  const [diffSource] = createSignal<DiffSource>({ type: "working" })
  const { diffs, fetchDiff } = useGitDiff(diffSource)
  const nav = useDiffNavigation(diffs)

  const [focusPane, setFocusPane] = createSignal<"left" | "right">("right")
  const [showReviewPane, setShowReviewPane] = createSignal(true)
  const [showFullDiff, setShowFullDiff] = createSignal(false)

  onMount(() => {
    fetchDiff()
  })

  // Re-fetch diffs when agent events indicate file changes
  createEffect(() => {
    agent.messages()
    fetchDiff()
  })

  useKeyboard((key) => {
    if (key.ctrl) {
      switch (key.name) {
        case "r":
          setShowReviewPane((v) => !v)
          break
        case "n":
          agent.createSession()
          break
        case "x":
          agent.cancel()
          break
      }
      return
    }

    if (focusPane() === "left") {
      switch (key.name) {
        case "j":
        case "down":
          nav.nextFile()
          break
        case "k":
        case "up":
          nav.prevFile()
          break
        case "return":
          setShowFullDiff(true)
          break
        case "escape":
          if (showFullDiff()) setShowFullDiff(false)
          break
        case "l":
          setFocusPane("right")
          break
      }
    } else {
      switch (key.name) {
        case "h":
          if (!key.ctrl) setFocusPane("left")
          break
      }
    }
  })

  const LeftPane = () => (
    <FileSidebar
      files={diffs()}
      selectedIndex={nav.selectedFileIndex()}
      onSelect={nav.selectFile}
      showPreview={focusPane() === "left"}
    />
  )

  const RightPane = () => (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} bg="#1a1a2e">
        <text fg="#87CEEB" bold> Agent </text>
        <text fg="#cccccc">
          {agent.currentSessionId()
            ? ` Session: ${agent.currentSessionId()!.slice(0, 12)}`
            : " No session"}
        </text>
        <box flexGrow={1} />
        <Show when={agent.connected()}>
          <text fg="#00FF00"> connected </text>
        </Show>
        <Show when={!agent.connected()}>
          <text fg="#FF4444"> disconnected </text>
        </Show>
      </box>

      <Chat messages={agent.messages()} isStreaming={agent.isStreaming()} />

      <MessageInput
        onSend={(content) => agent.sendMessage(content)}
        disabled={agent.isStreaming()}
      />
    </box>
  )

  return (
    <box flexDirection="column" width="100%" height="100%">
      <Show
        when={showReviewPane()}
        fallback={<RightPane />}
      >
        <SplitPane
          leftWidth="30%"
          left={<LeftPane />}
          right={<RightPane />}
          onFocusChange={setFocusPane}
        />
      </Show>

      <Show when={showFullDiff()}>
        <box
          position="absolute"
          top={1}
          left={2}
          right={2}
          bottom={2}
          borderStyle="rounded"
          borderColor="#87CEEB"
          bg="#0d0d1a"
          flexDirection="column"
        >
          <box flexDirection="row" width="100%" height={1} bg="#1a1a2e">
            <text fg="#87CEEB" bold> Diff View </text>
            <box flexGrow={1} />
            <text fg="#666666">Esc to close</text>
          </box>
          <DiffViewer
            file={nav.selectedFile()}
            viewMode="unified"
            selectedHunkIndex={nav.selectedHunkIndex()}
          />
        </box>
      </Show>
    </box>
  )
}
