import { createSignal, createEffect, onMount, onCleanup, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useAgent } from "../../hooks/use-agent"
import { useGitDiff, type DiffSource } from "../../hooks/use-git"
import { updateDiffContext, clearDiffContext } from "../../core/diff-context"
import { Chat } from "./chat"
import { MessageInput } from "./message-input"
import { SessionDialog } from "./session-dialog"
import { LoginDialog } from "./login-dialog"

export const AgenticMode = () => {
  const agent = useAgent()
  const [showSessions, setShowSessions] = createSignal(false)
  const [showLogin, setShowLogin] = createSignal(false)

  const [diffSource] = createSignal<DiffSource>({ type: "working" })
  const { diffs, fetchDiff } = useGitDiff(diffSource)

  onMount(() => {
    fetchDiff()
  })

  createEffect(() => {
    const files = diffs()
    if (files.length > 0) {
      updateDiffContext(files, "working")
    } else {
      clearDiffContext()
    }
  })

  onCleanup(() => {
    clearDiffContext()
  })

  useKeyboard((key) => {
    if (key.ctrl) {
      switch (key.name) {
        case "n":
          agent.createSession()
          break
        case "a":
          setShowSessions((v) => !v)
          break
        case "x":
          agent.cancel()
          break
        case "l":
          setShowLogin((v) => !v)
          break
        case "r":
          fetchDiff()
          break
      }
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} bg="#1a1a2e">
        <text fg="#87CEEB" bold> Agent </text>
        <text fg="#cccccc">
          {agent.currentSessionId()
            ? ` Session: ${agent.currentSessionId()!.slice(0, 12)}`
            : " No session"}
        </text>
        <box flexGrow={1} />
        <text fg="#888888"> Ctrl+L:login </text>
        <Show when={agent.connected()}>
          <text fg="#00FF00"> connected </text>
        </Show>
        <Show when={!agent.connected()}>
          <text fg="#FF4444"> disconnected </text>
        </Show>
      </box>

      <Show when={agent.error()}>
        <box width="100%" height={1} bg="#330000">
          <text fg="#FF4444"> Error: {agent.error()} </text>
        </box>
      </Show>

      <box flexGrow={1} minHeight={0} width="100%" overflow="hidden">
        <Chat messages={agent.messages()} isStreaming={agent.isStreaming()} />
      </box>

      <MessageInput
        onSend={(content) => agent.sendMessage(content)}
        disabled={agent.isStreaming()}
      />

      <Show when={showSessions()}>
        <SessionDialog
          sessions={agent.sessions() ?? []}
          currentSessionId={agent.currentSessionId()}
          onSelect={(id) => {
            agent.switchSession(id)
            setShowSessions(false)
          }}
          onClose={() => setShowSessions(false)}
          onCreate={() => {
            agent.createSession()
            setShowSessions(false)
          }}
        />
      </Show>

      <Show when={showLogin()}>
        <LoginDialog
          onClose={() => setShowLogin(false)}
          onAuthenticated={() => setShowLogin(false)}
        />
      </Show>
    </box>
  )
}
