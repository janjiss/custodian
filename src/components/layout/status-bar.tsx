import { Show } from "solid-js"
import { useTheme } from "../../theme/engine"

interface StatusBarProps {
  modelLabel?: string
  connected?: boolean
  streaming?: boolean
  leaderLabel?: string
  contextWindowLabel?: string
}

export const StatusBar = (props: StatusBarProps) => {
  const theme = useTheme()
  const leader = props.leaderLabel ?? "Ctrl+G"
  return (
    <box flexDirection="column" width="100%" height={2}>
      <box flexDirection="row" width="100%" height={1}>
        <text fg={theme.color("selectedListItemText")} bg={theme.color("primary")}>
          {" "}Custodian{" "}
        </text>
        <Show when={props.modelLabel}>
          <text fg={theme.color("selectedListItemText")} bg={theme.color("secondary")}>
            {" "}{props.modelLabel}{" "}
          </text>
        </Show>
        <Show when={props.streaming}>
          <text fg={theme.color("selectedListItemText")} bg={theme.color("warning")}>
            {" "}Generating{" "}
          </text>
        </Show>
        <Show when={props.contextWindowLabel}>
          <text fg={theme.color("selectedListItemText")} bg={theme.color("backgroundMenu")}>
            {" "}{props.contextWindowLabel}{" "}
          </text>
        </Show>
        <box flexGrow={1} />
        <Show when={props.connected}>
          <text fg={theme.color("success")}> ● </text>
        </Show>
        <Show when={props.connected === false}>
          <text fg={theme.color("error")}> ○ </text>
        </Show>
      </box>

      <box flexDirection="row" width="100%" height={1}>
        <text fg={theme.color("textMuted")}>
          {` esc stop  leader: ${leader}  ${leader}+s sessions  ${leader}+. / ${leader}+, pane  ${leader}+[ / ${leader}+] resize  ctrl+? help`}
        </text>
      </box>
    </box>
  )
}
