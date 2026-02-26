import { type JSX, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Mode } from "../../app"
import { StatusBar } from "./status-bar"
import { HelpOverlay } from "./help-overlay"

interface AppShellProps {
  mode: Mode
  children: JSX.Element
  onCycleMode: () => void
  onJumpToMode: (m: Mode) => void
  showHelp: boolean
  onToggleHelp: () => void
}

export const AppShell = (props: AppShellProps) => {
  useKeyboard((key) => {
    if (key.name === "tab" && !key.ctrl && !key.meta) {
      props.onCycleMode()
      return
    }

    if (key.ctrl && key.name === "?") {
      props.onToggleHelp()
      return
    }

    if (key.ctrl && key.name === "c") {
      process.exit(0)
    }

    if (!key.ctrl && !key.meta) {
      switch (key.name) {
        case "1":
          props.onJumpToMode("review")
          break
        case "2":
          props.onJumpToMode("agent")
          break
        case "3":
          props.onJumpToMode("combined")
          break
      }
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexGrow={1} width="100%">
        {props.children}
      </box>
      <StatusBar mode={props.mode} />
      <Show when={props.showHelp}>
        <HelpOverlay onClose={props.onToggleHelp} />
      </Show>
    </box>
  )
}
