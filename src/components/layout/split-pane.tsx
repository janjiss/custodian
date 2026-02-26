import { type JSX, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"

interface SplitPaneProps {
  left: JSX.Element
  right: JSX.Element
  leftWidth?: string | number
  onFocusChange?: (pane: "left" | "right") => void
}

export const SplitPane = (props: SplitPaneProps) => {
  const [focus, setFocus] = createSignal<"left" | "right">("left")

  useKeyboard((key) => {
    if (key.name === "h" && !key.ctrl) {
      setFocus("left")
      props.onFocusChange?.("left")
    } else if (key.name === "l" && !key.ctrl) {
      setFocus("right")
      props.onFocusChange?.("right")
    }
  })

  const leftBorder = () => (focus() === "left" ? "#87CEEB" : "#444444")
  const rightBorder = () => (focus() === "right" ? "#87CEEB" : "#444444")

  return (
    <box flexDirection="row" width="100%" height="100%">
      <box
        width={props.leftWidth ?? "30%"}
        height="100%"
        borderStyle="single"
        borderColor={leftBorder()}
        flexDirection="column"
      >
        {props.left}
      </box>
      <box
        flexGrow={1}
        height="100%"
        borderStyle="single"
        borderColor={rightBorder()}
        flexDirection="column"
      >
        {props.right}
      </box>
    </box>
  )
}
