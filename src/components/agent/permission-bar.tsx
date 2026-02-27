import { Show, For, createSignal, createMemo } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Permission } from "../../core/agent"
import { useTheme } from "../../theme/engine"

interface PermissionBarProps {
  permission: Permission | null
  onReply: (id: string, response: "once" | "always" | "reject") => void
  focused: boolean
}

export const PermissionBar = (props: PermissionBarProps) => {
  const theme = useTheme()
  const choices = [
    { id: "once", label: "Once" },
    { id: "always", label: "Always" },
    { id: "reject", label: "Reject" },
  ] as const
  const [selected, setSelected] = createSignal(0)

  useKeyboard((key) => {
    if (!props.focused || !props.permission) return

    if (key.name === "left" || key.name === "h") {
      setSelected((i) => (i - 1 + choices.length) % choices.length)
      return
    }
    if (key.name === "right" || key.name === "l") {
      setSelected((i) => (i + 1) % choices.length)
      return
    }

    if (key.name === "return") {
      const next = choices[selected()].id
      props.onReply(props.permission.id, next)
      return
    }

    switch (key.name) {
      case "y":
        props.onReply(props.permission.id, "once")
        return
      case "a":
        props.onReply(props.permission.id, "always")
        return
      case "n":
        props.onReply(props.permission.id, "reject")
        return
    }
  })

  return (
    <Show when={props.permission}>
      {(perm) => (
        <box
          flexDirection="column"
          width="100%"
          borderStyle="rounded"
          borderColor={theme.color("warning")}
          bg={theme.color("backgroundPanel")}
          padding={1}
        >
          <box flexDirection="row" width="100%" height={1}>
            <text fg={theme.color("warning")} bold>△ Permission required</text>
            <box flexGrow={1} />
            <text fg={theme.color("textMuted")}>← → select  Enter confirm</text>
          </box>
          <box paddingLeft={1} paddingRight={1} marginTop={1}>
            <text fg={theme.color("text")} wrap="word">{perm().title}</text>
          </box>

          <box flexDirection="row" gap={1} paddingLeft={1} marginTop={1}>
            <For each={choices}>
              {(choice, i) => {
                const active = createMemo(() => i() === selected())
                const color = createMemo(() => {
                  if (choice.id === "once") return "#98c379"
                  if (choice.id === "always") return "#61afef"
                  return "#e06c75"
                })
                return (
                  <box
                    flexDirection="row"
                    bg={active() ? color() : undefined}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text fg={active() ? theme.color("selectedListItemText") : color()} bold>{choice.label}</text>
                  </box>
                )
              }}
            </For>
          </box>

          <box flexDirection="row" width="100%" marginTop={1}>
            <text fg={theme.color("textMuted")}>y once  a always  n reject</text>
          </box>
        </box>
      )}
    </Show>
  )
}
