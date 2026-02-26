import { For, createMemo } from "solid-js"
import type { FileDiff } from "../../core/diff"
import { statusChar, formatStats } from "../../core/diff"

interface FileTreeProps {
  files: FileDiff[]
  selectedIndex: number
  onSelect: (index: number) => void
}

export const FileTree = (props: FileTreeProps) => {
  return (
    <scrollbox width="100%" height="100%">
      <box flexDirection="column" width="100%">
        <text fg="#87CEEB" bold>
          {" "}Files ({props.files.length})
        </text>
        <For each={props.files}>
          {(file, i) => {
            const isSelected = createMemo(() => i() === props.selectedIndex)
            const statusColor = createMemo(() => {
              switch (file.status) {
                case "added":
                  return "#00FF00"
                case "deleted":
                  return "#FF4444"
                case "modified":
                  return "#FFFF00"
                case "renamed":
                  return "#87CEEB"
              }
            })

            return (
              <box
                flexDirection="row"
                width="100%"
                bg={isSelected() ? "#333355" : undefined}
              >
                <text fg={statusColor()} width={2}>
                  {statusChar(file.status)}
                </text>
                <text
                  fg={isSelected() ? "#FFFFFF" : "#cccccc"}
                  flexGrow={1}
                >
                  {" "}{file.newPath}
                </text>
                <text fg="#888888">
                  {formatStats(file)}{" "}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </scrollbox>
  )
}
