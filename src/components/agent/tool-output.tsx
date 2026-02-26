import { Show } from "solid-js"
import type { ToolCall } from "../../core/agent"

interface ToolOutputProps {
  toolCall: ToolCall
}

export const ToolOutput = (props: ToolOutputProps) => {
  return (
    <box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor="#444444"
      padding={1}
    >
      <box flexDirection="row" gap={1}>
        <text fg="#FFFF00" bold>Tool:</text>
        <text fg="#87CEEB">{props.toolCall.name}</text>
        <Show when={props.toolCall.approved !== undefined}>
          <text fg={props.toolCall.approved ? "#00FF00" : "#FF4444"}>
            [{props.toolCall.approved ? "approved" : "denied"}]
          </text>
        </Show>
      </box>
      <Show when={props.toolCall.output}>
        <box paddingTop={1}>
          <text fg="#cccccc" wrap="word">
            {props.toolCall.output}
          </text>
        </box>
      </Show>
    </box>
  )
}
