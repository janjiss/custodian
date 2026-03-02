import { createSignal, createMemo, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { toggleDiffContext } from "../../core/diff-context"
import type { SlashCommand } from "../../core/agent"
import { useTheme } from "../../theme/engine"

interface MessageInputProps {
  onSend: (content: string) => void
  onCommand?: (command: string) => void
  onInteract?: () => void
  disabled: boolean
  focused?: boolean
  commands?: SlashCommand[]
  suppressInputUntil?: number
}

const MAX_HISTORY = 50
const CMD_NAME_WIDTH = 18
const CMD_DESC_WIDTH = 56

function clampText(text: string, width: number): string {
  if (width <= 1) return ""
  if (text.length <= width) return text
  return `${text.slice(0, width - 1)}…`
}

export const MessageInput = (props: MessageInputProps) => {
  const theme = useTheme()
  let inputRef: any
  const [value, setValue] = createSignal("")
  const [history, setHistory] = createSignal<string[]>([])
  const [historyIdx, setHistoryIdx] = createSignal(-1)
  const [showCommands, setShowCommands] = createSignal(false)
  const [cmdIdx, setCmdIdx] = createSignal(0)

  const filteredCommands = createMemo(() => {
    if (!showCommands()) return []
    const text = value().slice(1).toLowerCase()
    const cmds = props.commands ?? []
    if (!text) return cmds
    return cmds.filter(
      (c) => c.name.toLowerCase().includes(text) ||
        c.description?.toLowerCase().includes(text)
    )
  })

  const visibleCommandRows = createMemo(() => Math.min(filteredCommands().length, 4))

  const handleSend = (submitted?: string) => {
    props.onInteract?.()
    if ((props.suppressInputUntil ?? 0) > Date.now()) return
    const text = (submitted ?? inputRef?.value ?? value() ?? "").trim()
    if (!text || props.disabled) return

    if (text.startsWith("/") && props.onCommand) {
      const cmd = text.slice(1).split(" ")[0]
      props.onCommand(cmd)
      setValue("")
      if (inputRef) inputRef.value = ""
      setShowCommands(false)
      return
    }

    setHistory((prev) => {
      const next = [text, ...prev.filter((h) => h !== text)]
      return next.slice(0, MAX_HISTORY)
    })
    setHistoryIdx(-1)
    props.onSend(text)
    setValue("")
    if (inputRef) inputRef.value = ""
    setShowCommands(false)
  }

  const autocompleteCommand = () => {
    const cmds = filteredCommands()
    if (cmds.length === 0) return
    const selected = cmds[Math.min(cmdIdx(), cmds.length - 1)]
    const completed = `/${selected.name} `
    setValue(completed)
    if (inputRef) inputRef.value = completed
    setShowCommands(false)
    setCmdIdx(0)
  }

  const handleContentChange = (next: string) => {
    props.onInteract?.()
    if ((props.suppressInputUntil ?? 0) > Date.now()) {
      if (inputRef) inputRef.value = value()
      return
    }
    const newContent = next ?? inputRef?.value ?? ""
    setValue(newContent)
    setHistoryIdx(-1)
    if (newContent.startsWith("/") && newContent.length > 0) {
      setShowCommands(true)
      setCmdIdx(0)
    } else {
      setShowCommands(false)
    }
  }

  useKeyboard((key) => {
    if (!props.focused) return

    if (key.ctrl && key.name === "d") {
      toggleDiffContext()
      return
    }

    if (showCommands() && filteredCommands().length > 0) {
      if (key.name === "tab") {
        autocompleteCommand()
        return
      }
      if (key.name === "down" || (key.ctrl && key.name === "n")) {
        setCmdIdx((i) => Math.min(i + 1, filteredCommands().length - 1))
        return
      }
      if (key.name === "up" || (key.ctrl && key.name === "p")) {
        setCmdIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (key.name === "escape") {
        setShowCommands(false)
        return
      }
    }

    if (key.ctrl && key.name === "p") {
      const h = history()
      if (h.length === 0) return
      const newIdx = Math.min(historyIdx() + 1, h.length - 1)
      setHistoryIdx(newIdx)
      const val = h[newIdx]
      setValue(val)
      if (inputRef) inputRef.value = val
      return
    }
    if (key.ctrl && key.name === "n") {
      const h = history()
      const newIdx = historyIdx() - 1
      if (newIdx < 0) {
        setHistoryIdx(-1)
        setValue("")
        if (inputRef) inputRef.value = ""
      } else {
        setHistoryIdx(newIdx)
        const val = h[newIdx]
        setValue(val)
        if (inputRef) inputRef.value = val
      }
      return
    }
  })

  return (
    <box flexDirection="column" width="100%" onMouseDown={() => props.onInteract?.()}>
      <Show when={showCommands() && filteredCommands().length > 0}>
        <box
          flexDirection="column"
          width="100%"
          height={visibleCommandRows() + 2}
          borderStyle="single"
          borderColor={theme.color("border")}
          bg={theme.color("backgroundPanel")}
          overflow="hidden"
        >
          <scrollbox width="100%" height={visibleCommandRows()}>
            <box flexDirection="column" width="100%">
              <For each={filteredCommands()}>
                {(cmd, i) => (
                  <box
                    flexDirection="row"
                    width="100%"
                    height={1}
                    bg={i() === cmdIdx() ? theme.color("borderSubtle") : undefined}
                  >
                    <text fg={theme.color("textMuted")} width={2} wrap="none">
                      {i() === cmdIdx() ? "›" : " "}
                    </text>
                    <text fg={theme.color("accent")} width={CMD_NAME_WIDTH} wrap="none">
                      /{clampText(cmd.name, CMD_NAME_WIDTH - 1)}
                    </text>
                    <text fg={theme.color("textMuted")} wrap="none">
                      {clampText(cmd.description ?? "", CMD_DESC_WIDTH)}
                    </text>
                  </box>
                )}
              </For>
            </box>
          </scrollbox>
        </box>
      </Show>

      <box
        flexDirection="row"
        width="100%"
        height={3}
        borderStyle="single"
        borderColor={props.focused ? theme.color("borderActive") : theme.color("border")}
        bg={theme.color("backgroundPanel")}
        padding={0}
      >
        <text fg={props.focused ? theme.color("primary") : theme.color("textMuted")} width={2}> {">"} </text>
        <input
          ref={inputRef}
          flexGrow={1}
          value=""
          focused={props.focused}
          placeholder="Type a message and press Enter"
          onInput={handleContentChange}
          onSubmit={() => handleSend()}
        />
      </box>
    </box>
  )
}
