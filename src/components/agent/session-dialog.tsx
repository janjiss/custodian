import { createSignal, For, Show, createMemo } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { AgentSession } from "../../core/agent"
import { useTheme } from "../../theme/engine"

interface SessionDialogProps {
  sessions: AgentSession[]
  currentSessionId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  onCreate: () => void
}

export const SessionDialog = (props: SessionDialogProps) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [filter, setFilter] = createSignal("")
  const filteredSessions = createMemo(() => {
    const query = filter().trim().toLowerCase()
    if (!query) return props.sessions
    return props.sessions.filter((session) =>
      (session.title ?? session.id).toLowerCase().includes(query),
    )
  })

  useKeyboard((key) => {
    switch (key.name) {
      case "j":
      case "down":
        setSelectedIndex((i) => {
          const max = Math.max(filteredSessions().length - 1, 0)
          return Math.min(i + 1, max)
        })
        break
      case "k":
      case "up":
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case "return":
        if (filteredSessions().length > 0) {
          props.onSelect(filteredSessions()[selectedIndex()].id)
        }
        break
      case "n":
        if (key.meta || (key as any).alt === true) props.onCreate()
        break
      case "escape":
        props.onClose()
        break
    }
  })

  return (
    <box
      width="100%"
      height="100%"
      bg={theme.color("background")}
      flexDirection="column"
      paddingTop={3}
    >
    <box
      width={80}
      maxWidth="100%"
      alignSelf="center"
      borderStyle="single"
      borderColor={theme.color("border")}
      padding={1}
      flexDirection="column"
      bg={theme.color("backgroundPanel")}
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg={theme.color("text")} bold>Sessions</text>
        <text fg={theme.color("textMuted")}>esc</text>
      </box>
      <box width="100%" height={1} borderStyle="single" borderColor={theme.color("border")} marginTop={1}>
        <input
          flexGrow={1}
          value={filter()}
          placeholder="Search"
          focused
          onInput={(v: string) => {
            setFilter(v)
            setSelectedIndex(0)
          }}
        />
      </box>
      <Show
        when={filteredSessions().length > 0}
        fallback={<text fg={theme.color("textMuted")}>No sessions. Press Alt+N to create one.</text>}
      >
        <scrollbox flexGrow={1} width="100%">
          <box flexDirection="column" width="100%">
            <For each={filteredSessions()}>
              {(session, i) => {
                const isSelected = createMemo(() => i() === selectedIndex())
                const isCurrent = createMemo(() => session.id === props.currentSessionId)

                return (
                  <box
                    flexDirection="row"
                    width="100%"
                    bg={isSelected() ? theme.color("borderSubtle") : undefined}
                    gap={2}
                  >
                    <text fg={isSelected() ? theme.color("text") : theme.color("textMuted")} width={2}>
                      {isSelected() ? "›" : " "}
                    </text>
                    <text fg={isCurrent() ? theme.color("success") : isSelected() ? theme.color("text") : theme.color("textMuted")} flexGrow={1}>
                      {session.title ?? session.id.slice(0, 12)}
                    </text>
                    <text fg={theme.color("textMuted")}>
                      {new Date(session.createdAt).toLocaleString()}
                    </text>
                  </box>
                )
              }}
            </For>
          </box>
        </scrollbox>
      </Show>
      <box flexDirection="row" width="100%" marginTop={1}>
        <text fg={theme.color("textMuted")}>↑↓ select  enter confirm  alt+n new</text>
      </box>
    </box>
    </box>
  )
}
