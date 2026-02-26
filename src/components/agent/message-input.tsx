import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"

interface MessageInputProps {
  onSend: (content: string) => void
  disabled: boolean
}

export const MessageInput = (props: MessageInputProps) => {
  const [value, setValue] = createSignal("")
  const [focused, setFocused] = createSignal(false)

  const handleSend = () => {
    const text = value().trim()
    if (!text || props.disabled) return
    props.onSend(text)
    setValue("")
  }

  useKeyboard((key) => {
    if (key.ctrl && key.name === "s") {
      handleSend()
    }
  })

  return (
    <box
      flexDirection="row"
      width="100%"
      height={3}
      borderStyle="single"
      borderColor={focused() ? "#87CEEB" : "#444444"}
      padding={0}
    >
      <text fg="#555555" width={2}> {">"} </text>
      <textarea
        flexGrow={1}
        value={value()}
        placeholder="Type your message... (@file to reference)"
        onInput={(e: { value: string }) => setValue(e.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmit={handleSend}
      />
      <text fg="#666666" width={8}> Ctrl+S </text>
    </box>
  )
}
