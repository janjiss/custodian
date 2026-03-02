import { For, Show, Switch, Match, createMemo } from "solid-js"
import { createTextAttributes } from "@opentui/core"
import type { AgentMessage, MessagePart } from "../../core/agent"
import { useTheme } from "../../theme/engine"

const ITALIC = createTextAttributes({ italic: true })

interface ChatProps {
  messages: AgentMessage[]
  isStreaming: boolean
  showThinking?: boolean
  showToolDetails?: boolean
}

const toolTitle = (tool: string) => {
  switch (tool) {
    case "bash": return "Built"
    case "read": return "Read"
    case "write": return "Wrote"
    case "edit": return "Edited"
    case "apply_patch": return "Patched"
    default: return tool
  }
}

const UserMessage = (props: { message: AgentMessage }) => {
  const theme = useTheme()
  const firstText = createMemo(
    () => props.message.parts.find((p) => p.type === "text" && p.text)?.text ?? "",
  )

  return (
    <box
      flexDirection="row"
      width="100%"
      marginTop={0}
      bg={theme.color("backgroundMenu")}
      borderStyle="single"
      borderColor={theme.color("borderSubtle")}
      paddingLeft={0}
      paddingRight={1}
    >
      <text fg={theme.color("primary")} width={2}>▏ </text>
      <text fg={theme.color("text")} wrap="word" selectable flexGrow={1}>{firstText()}</text>
    </box>
  )
}

const ReasoningPart = (props: { part: MessagePart }) => {
  const theme = useTheme()
  const content = createMemo(() => (props.part.text ?? "").replace("[REDACTED]", "").trim())
  const lines = createMemo(() => content().split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0))
  if (!content()) return null
  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="row" width="100%" paddingLeft={1} paddingRight={1}>
        <text fg={theme.color("secondary")} attributes={ITALIC}>~ Thinking</text>
      </box>
      <box flexDirection="column" paddingLeft={1} paddingRight={1}>
        <For each={lines()}>
          {(line) => (
            <text fg={theme.color("textMuted")} wrap="word" selectable attributes={ITALIC}>
              {line}
            </text>
          )}
        </For>
      </box>
    </box>
  )
}

const TextPart = (props: { part: MessagePart }) => {
  const theme = useTheme()
  return (
    <box>
      <text fg={theme.color("text")} wrap="word" selectable>{props.part.text ?? ""}</text>
    </box>
  )
}

const ToolPart = (props: { part: MessagePart; showDetails: boolean }) => {
  const theme = useTheme()
  const state = createMemo(() => props.part.toolState)
  const status = createMemo(() => state()?.status ?? "pending")
  const symbol = createMemo(() => {
    switch (status()) {
      case "running": return "◌"
      case "completed": return "•"
      case "error": return "✗"
      default: return "•"
    }
  })

  if (!props.showDetails && status() === "completed") return null

  return (
    <box flexDirection="column">
      <text fg={status() === "error" ? theme.color("error") : theme.color("textMuted")} attributes={ITALIC}>
        ~ {symbol()} {toolTitle(props.part.tool ?? "tool")}{" "}
        <Show when={status() === "running"}>
          <span>...</span>
        </Show>
        <Show when={status() === "completed"}>
          <span>{state()?.time?.end && state()?.time?.start ? `${((state()!.time!.end! - state()!.time!.start!) / 1000).toFixed(1)}s` : ""}</span>
        </Show>
      </text>

      <Show when={props.showDetails && state()?.output}>
        <text fg={theme.color("textMuted")} wrap="word" selectable attributes={ITALIC}>
          {String(state()!.output).slice(0, 260)}
        </text>
      </Show>
    </box>
  )
}

const StepFinishPart = (props: { part: MessagePart }) => {
  const theme = useTheme()
  const tokenLabel = createMemo(() => {
    const t = props.part.tokens
    if (!t) return ""
    return `${t.input} in · ${t.output} out`
  })
  return (
    <box>
      <text fg={theme.color("textMuted")}>
        {tokenLabel()}
        <Show when={props.part.cost && props.part.cost > 0}>
          {` · $${props.part.cost!.toFixed(4)}`}
        </Show>
      </text>
    </box>
  )
}

const PartRenderer = (props: { part: MessagePart; showThinking: boolean; showToolDetails: boolean }) => {
  return (
    <Switch fallback={null}>
      <Match when={props.part.type === "text" && props.part.text}>
        <TextPart part={props.part} />
      </Match>
      <Match when={props.part.type === "reasoning"}>
        <ReasoningPart part={props.part} />
      </Match>
      <Match when={props.part.type === "tool"}>
        <ToolPart part={props.part} showDetails={props.showToolDetails} />
      </Match>
      <Match when={props.part.type === "step-finish"}>
        <StepFinishPart part={props.part} />
      </Match>
    </Switch>
  )
}

const AssistantMessage = (props: { message: AgentMessage; showThinking: boolean; showToolDetails: boolean }) => {
  const theme = useTheme()
  return (
    <box
      flexDirection="row"
      width="100%"
      marginTop={1}
    >
      <text fg={theme.color("border")} width={2}>▏ </text>
      <box flexDirection="column" flexGrow={1}>
        <For each={props.message.parts}>
          {(part, i) => (
            <box marginTop={i() > 0 ? 1 : 0}>
              <PartRenderer
                part={part}
                showThinking={props.showThinking}
                showToolDetails={props.showToolDetails}
              />
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

export const Chat = (props: ChatProps) => {
  const theme = useTheme()
  const thinkingVisible = createMemo(() => props.showThinking ?? true)
  const toolDetailsVisible = createMemo(() => props.showToolDetails ?? true)

  return (
    <scrollbox width="100%" height="100%" stickyScroll stickyStart="bottom">
      <box flexDirection="column" width="100%" padding={1}>
        <Show
          when={props.messages.length > 0}
          fallback={
            <box width="100%" justifyContent="center" alignItems="center">
              <text fg={theme.color("textMuted")}>Type a message to start</text>
            </box>
          }
        >
          <For each={props.messages}>
            {(msg) => (
              <box
                flexDirection="column"
                width="100%"
                paddingBottom={msg.role === "user" ? 0 : 1}
              >
                <Show
                  when={msg.role === "user"}
                  fallback={
                    <AssistantMessage
                      message={msg}
                      showThinking={thinkingVisible()}
                      showToolDetails={toolDetailsVisible()}
                    />
                  }
                >
                  <UserMessage message={msg} />
                </Show>
              </box>
            )}
          </For>
        </Show>

        <Show when={props.isStreaming}>
          <text fg={theme.color("textMuted")}>thinking...</text>
        </Show>
      </box>
    </scrollbox>
  )
}
