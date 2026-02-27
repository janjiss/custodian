import { For, Show, createSignal, createMemo } from "solid-js"
import type { FileDiff, DiffLine } from "../../core/diff"
import { statusChar, formatStats, flattenHunkLines } from "../../core/diff"

interface FileSidebarProps {
  files: FileDiff[]
  selectedIndex: number
  onSelect: (index: number) => void
  showPreview: boolean
}

const InlineDiffPreview = (props: { file: FileDiff }) => {
  const previewLines = createMemo(() => {
    const lines = flattenHunkLines(props.file.hunks)
    return lines.slice(0, 12)
  })

  return (
    <box flexDirection="column" width="100%" paddingLeft={1} borderStyle="single" borderColor="#333333" selectable>
      <text fg="#555555" bold selectable>
        {props.file.newPath}
      </text>
      <For each={previewLines()}>
        {(line) => {
          const color =
            line.type === "add"
              ? "#00FF00"
              : line.type === "remove"
                ? "#FF4444"
                : line.type === "header"
                  ? "#87CEEB"
                  : "#888888"
          const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : line.type === "header" ? "@" : " "

          return (
            <text fg={color} selectable>
              {prefix}{line.content.slice(0, 50)}
            </text>
          )
        }}
      </For>
      <Show when={flattenHunkLines(props.file.hunks).length > 12}>
        <text fg="#555555">... more</text>
      </Show>
    </box>
  )
}

export const FileSidebar = (props: FileSidebarProps) => {
  const selectedFile = createMemo(() => {
    return props.files[props.selectedIndex] ?? null
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <text fg="#87CEEB" bold>
        {" "}Changed Files ({props.files.length})
      </text>

      <scrollbox flexGrow={props.showPreview ? undefined : 1} width="100%">
        <box flexDirection="column" width="100%">
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
                  flexDirection="column"
                  width="100%"
                  bg={isSelected() ? "#333355" : undefined}
                >
                  <box flexDirection="row" width="100%">
                    <text fg={statusColor()} width={2}>
                      {statusChar(file.status)}
                    </text>
                    <text
                      fg={isSelected() ? "#FFFFFF" : "#cccccc"}
                      flexGrow={1}
                    >
                      {" "}{file.newPath}
                    </text>
                    <Show when={isSelected()}>
                      <text fg="#87CEEB" width={2}>{">"}</text>
                    </Show>
                  </box>
                  <text fg="#555555" paddingLeft={3}>
                    {formatStats(file)}
                  </text>
                </box>
              )
            }}
          </For>
        </box>
      </scrollbox>

      <Show when={props.showPreview && selectedFile()}>
        <InlineDiffPreview file={selectedFile()!} />
      </Show>
    </box>
  )
}
