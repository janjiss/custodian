import { For, Show, createMemo } from "solid-js"
import type { AgentMessage } from "../../core/agent"

interface ChatProps {
  messages: AgentMessage[]
  isStreaming: boolean
}

const MessageBubble = (props: { message: AgentMessage }) => {
  const isUser = createMemo(() => props.message.role === "user")
  const roleLabel = createMemo(() => (isUser() ? "You" : "Assistant"))
  const roleColor = createMemo(() => (isUser() ? "#87CEEB" : "#00FF00"))

  return (
    <box flexDirection="column" width="100%" paddingBottom={1}>
      <text fg={roleColor()} bold>
        {roleLabel()}:
      </text>
      <box paddingLeft={2} flexDirection="column">
        <text fg="#cccccc" wrap="word">
          {props.message.content}
        </text>
        <Show when={props.message.toolCalls?.length}>
          <For each={props.message.toolCalls}>
            {(tc) => (
              <box flexDirection="row" gap={1}>
                <text fg="#FFFF00">Tool:</text>
                <text fg="#87CEEB">{tc.name}</text>
                <Show when={tc.approved !== undefined}>
                  <text fg={tc.approved ? "#00FF00" : "#FF4444"}>
                    ({tc.approved ? "approved" : "denied"})
                  </text>
                </Show>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}

export const Chat = (props: ChatProps) => {
  return (
    <scrollbox width="100%" height="100%">
      <box flexDirection="column" width="100%" padding={1}>
        <Show
          when={props.messages.length > 0}
          fallback={
            <box width="100%" justifyContent="center" alignItems="center">
              <text fg="#666666">
                No messages yet. Type a message to get started.
              </text>
            </box>
          }
        >
          <For each={props.messages}>
            {(msg) => <MessageBubble message={msg} />}
          </For>
        </Show>
        <Show when={props.isStreaming}>
          <text fg="#FFFF00">Thinking...</text>
        </Show>
      </box>
    </scrollbox>
  )
}
