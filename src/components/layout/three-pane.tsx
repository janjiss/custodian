import { type JSX } from "solid-js"
import { useTheme } from "../../theme/engine"

export type Pane = "files" | "chat" | "diff"

interface ThreePaneProps {
  files: JSX.Element
  chat: JSX.Element
  diff: JSX.Element
  focusedPane: Pane
  expandedPane: Pane | null
  diffVisible: boolean
  baseWidths?: { files: number; chat: number; diff: number }
}

export const ThreePane = (props: ThreePaneProps) => {
  const theme = useTheme()
  const borderColor = (pane: Pane) =>
    props.focusedPane === pane ? theme.color("borderActive") : theme.color("border")

  const paneWidth = (pane: Pane): string | number => {
    const expanded = props.expandedPane
    const diffVis = props.diffVisible

    if (!diffVis && pane === "diff") return 0

    const totalPanes = diffVis ? 3 : 2

    if (expanded === pane) {
      return totalPanes === 3 ? "60%" : "75%"
    }

    if (expanded !== null && expanded !== pane) {
      return totalPanes === 3 ? "20%" : "25%"
    }

    if (totalPanes === 2) {
      return pane === "files" ? "20%" : "80%"
    }

    const base = props.baseWidths ?? { files: 18, chat: 57, diff: 25 }
    switch (pane) {
      case "files": return `${base.files}%`
      case "chat": return `${base.chat}%`
      case "diff": return `${base.diff}%`
    }
  }

  return (
    <box flexDirection="row" width="100%" height="100%">
      <box
        width={paneWidth("files")}
        height="100%"
        borderStyle="single"
        borderColor={borderColor("files")}
        flexDirection="column"
        overflow="hidden"
      >
        <box height={1} width="100%" bg={theme.color("backgroundPanel")}>
          <text fg={borderColor("files")}> files </text>
        </box>
        {props.files}
      </box>

      {props.diffVisible && (
        <box
          width={paneWidth("diff")}
          height="100%"
          borderStyle="single"
          borderColor={borderColor("diff")}
          flexDirection="column"
          overflow="hidden"
        >
          <box height={1} width="100%" bg={theme.color("backgroundPanel")}>
            <text fg={borderColor("diff")}> diff </text>
          </box>
          {props.diff}
        </box>
      )}

      <box
        width={paneWidth("chat")}
        height="100%"
        borderStyle="single"
        borderColor={borderColor("chat")}
        flexDirection="column"
        overflow="hidden"
      >
        <box height={1} width="100%" bg={theme.color("backgroundPanel")}>
          <text fg={borderColor("chat")}> chat </text>
        </box>
        {props.chat}
      </box>

    </box>
  )
}
