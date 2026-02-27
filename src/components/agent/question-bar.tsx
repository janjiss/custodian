import { createMemo, createSignal, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { QuestionRequest } from "../../core/agent"
import { useTheme } from "../../theme/engine"

interface QuestionBarProps {
  request: QuestionRequest | null
  focused: boolean
  onReply: (id: string, answers: string[][]) => void
  onReject: (id: string) => void
}

export const QuestionBar = (props: QuestionBarProps) => {
  const theme = useTheme()
  const [selected, setSelected] = createSignal(0)
  const firstQuestion = createMemo(() => props.request?.questions?.[0])
  const options = createMemo(() => firstQuestion()?.options ?? [])
  const selectedLabel = createMemo(() => options()[selected()]?.label ?? "")

  useKeyboard((key) => {
    if (!props.focused || !props.request) return
    if (options().length === 0) return

    if (key.name === "left" || key.name === "h" || key.name === "up" || key.name === "k") {
      setSelected((i) => (i - 1 + options().length) % options().length)
      return
    }

    if (key.name === "right" || key.name === "l" || key.name === "down" || key.name === "j") {
      setSelected((i) => (i + 1) % options().length)
      return
    }

    if (key.name === "return") {
      props.onReply(props.request.id, [[selectedLabel()]])
      return
    }

    if (key.name === "escape") {
      props.onReject(props.request.id)
    }
  })

  return (
    <Show when={props.request && firstQuestion()}>
      <box
        flexDirection="column"
        width="100%"
        borderStyle="rounded"
        borderColor={theme.color("warning")}
        bg={theme.color("backgroundPanel")}
        padding={1}
      >
        <box flexDirection="row" width="100%">
          <text fg={theme.color("warning")} bold>△ Question</text>
          <box flexGrow={1} />
          <text fg={theme.color("textMuted")}>← → select  Enter confirm  Esc reject</text>
        </box>

        <box marginTop={1}>
          <text fg={theme.color("text")}>{firstQuestion()!.question}</text>
        </box>

        <box flexDirection="row" gap={1} marginTop={1}>
          <For each={options()}>
            {(opt, i) => {
              const active = createMemo(() => i() === selected())
              return (
                <box
                  bg={active() ? theme.color("warning") : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text fg={active() ? theme.color("selectedListItemText") : theme.color("warning")} bold>{opt.label}</text>
                </box>
              )
            }}
          </For>
        </box>
      </box>
    </Show>
  )
}
