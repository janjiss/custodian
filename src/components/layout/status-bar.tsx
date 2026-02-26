import type { Mode } from "../../app"

interface StatusBarProps {
  mode: Mode
}

const MODE_LABELS: Record<Mode, string> = {
  review: "Review",
  agent: "Agent",
  combined: "Combined",
}

const MODE_HINTS: Record<Mode, string> = {
  review: "Tab:mode  n/N:hunk  j/k:file  a:accept  q:quit",
  agent: "Tab:mode  Ctrl+N:new  Ctrl+X:cancel  Ctrl+S:send",
  combined: "Tab:mode  Ctrl+R:toggle-review  h/l:focus-pane",
}

export const StatusBar = (props: StatusBarProps) => {
  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      justifyContent="space-between"
    >
      <text fg="#000000" bg="#87CEEB">
        {" "}[{MODE_LABELS[props.mode]}]{" "}
      </text>
      <text fg="#888888">
        {MODE_HINTS[props.mode]}
      </text>
      <text fg="#666666">
        {" "}Ctrl+? help{" "}
      </text>
    </box>
  )
}
