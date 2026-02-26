import { createSignal, For, Show, createMemo } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { AgentSession } from "../../core/agent"

interface SessionDialogProps {
  sessions: AgentSession[]
  currentSessionId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  onCreate: () => void
}

export const SessionDialog = (props: SessionDialogProps) => {
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  useKeyboard((key) => {
    switch (key.name) {
      case "j":
      case "down":
        setSelectedIndex((i) => Math.min(i + 1, props.sessions.length - 1))
        break
      case "k":
      case "up":
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case "return":
        if (props.sessions.length > 0) {
          props.onSelect(props.sessions[selectedIndex()].id)
        }
        break
      case "n":
        if (key.ctrl) props.onCreate()
        break
      case "escape":
        props.onClose()
        break
    }
  })

  return (
    <box
      position="absolute"
      top={3}
      left="15%"
      right="15%"
      bottom={3}
      borderStyle="rounded"
      borderColor="#87CEEB"
      padding={1}
      flexDirection="column"
      bg="#1a1a2e"
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg="#87CEEB" bold>Sessions</text>
        <text fg="#666666">Ctrl+N: new | Enter: select | Esc: close</text>
      </box>
      <Show
        when={props.sessions.length > 0}
        fallback={<text fg="#666666">No sessions. Press Ctrl+N to create one.</text>}
      >
        <scrollbox flexGrow={1} width="100%">
          <box flexDirection="column" width="100%">
            <For each={props.sessions}>
              {(session, i) => {
                const isSelected = createMemo(() => i() === selectedIndex())
                const isCurrent = createMemo(() => session.id === props.currentSessionId)

                return (
                  <box
                    flexDirection="row"
                    width="100%"
                    bg={isSelected() ? "#333355" : undefined}
                    gap={2}
                  >
                    <text fg={isCurrent() ? "#00FF00" : "#666666"} width={2}>
                      {isCurrent() ? ">" : " "}
                    </text>
                    <text fg={isSelected() ? "#FFFFFF" : "#cccccc"} flexGrow={1}>
                      {session.title ?? session.id.slice(0, 12)}
                    </text>
                    <text fg="#555555">
                      {new Date(session.createdAt).toLocaleString()}
                    </text>
                  </box>
                )
              }}
            </For>
          </box>
        </scrollbox>
      </Show>
    </box>
  )
}
