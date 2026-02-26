import { createSignal, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useAgent } from "../../hooks/use-agent"
import { Chat } from "./chat"
import { MessageInput } from "./message-input"
import { SessionDialog } from "./session-dialog"

export const AgenticMode = () => {
  const agent = useAgent()
  const [showSessions, setShowSessions] = createSignal(false)

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

      <Chat messages={agent.messages()} isStreaming={agent.isStreaming()} />

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
    </box>
  )
}
