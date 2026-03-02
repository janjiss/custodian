import { type JSX } from "solid-js"
import { useTheme } from "../../theme/engine"

export type Pane = "files" | "chat" | "diff"
export type LayoutMode = "all" | "code" | "chat"

interface ThreePaneProps {
  files: JSX.Element
  chat: JSX.Element
  diff: JSX.Element
  focusedPane: Pane
  onFocusPane?: (pane: Pane) => void
  layoutMode: LayoutMode
  diffVisible: boolean
  baseWidths?: { files: number; chat: number; diff: number }
}

export const ThreePane = (props: ThreePaneProps) => {
  const theme = useTheme()
  const borderColor = (pane: Pane) =>
    props.focusedPane === pane ? theme.color("borderActive") : theme.color("border")

  const PaneBox = (pane: Pane, grow: number, content: JSX.Element) => (
    <box
      flexGrow={grow}
      height="100%"
      borderStyle="single"
      borderColor={borderColor(pane)}
      flexDirection="column"
      overflow="hidden"
      onMouseDown={() => props.onFocusPane?.(pane)}
    >
      <box height={1} width="100%" bg={theme.color("backgroundPanel")}>
        <text fg={borderColor(pane)}> {pane} </text>
      </box>
      {content}
    </box>
  )

  const base = props.baseWidths ?? { files: 18, chat: 57, diff: 25 }
  const normalize3 = (files: number, diff: number, chat: number) => {
    const f = Math.max(files, 1)
    const d = Math.max(diff, 1)
    const c = Math.max(chat, 1)
    const total = f + d + c
    return {
      files: Math.round((f / total) * 100),
      diff: Math.round((d / total) * 100),
      chat: Math.max(1, 100 - Math.round((f / total) * 100) - Math.round((d / total) * 100)),
    }
  }

  const normal = props.diffVisible
    ? normalize3(Math.max(12, base.files), Math.max(20, base.diff), Math.max(28, base.chat))
    : { files: 20, diff: 0, chat: 80 }

  return (
    <box flexDirection="row" width="100%" height="100%">
      {props.layoutMode === "chat" && PaneBox("chat", 100, props.chat)}

      {props.layoutMode === "code" && (
        <>
          {PaneBox("files", props.diffVisible ? 45 : 100, props.files)}
          {props.diffVisible && PaneBox("diff", 55, props.diff)}
        </>
      )}

      {props.layoutMode === "all" && (
        <>
          {PaneBox("files", normal.files, props.files)}
          {props.diffVisible && PaneBox("diff", normal.diff, props.diff)}
          {PaneBox("chat", normal.chat, props.chat)}
        </>
      )}

    </box>
  )
}
