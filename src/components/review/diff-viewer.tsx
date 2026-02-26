import { Show, For, createMemo } from "solid-js"
import type { FileDiff, DiffLine } from "../../core/diff"
import { flattenHunkLines } from "../../core/diff"

interface DiffViewerProps {
  file: FileDiff | null
  viewMode: "unified" | "split"
  selectedHunkIndex: number
}

const LINE_COLORS: Record<string, string> = {
  add: "#00FF00",
  remove: "#FF4444",
  context: "#cccccc",
  header: "#87CEEB",
}

const LINE_BG: Record<string, string | undefined> = {
  add: "#002200",
  remove: "#220000",
  context: undefined,
  header: undefined,
}

function linePrefix(type: string): string {
  switch (type) {
    case "add":
      return "+"
    case "remove":
      return "-"
    case "header":
      return "@"
    default:
      return " "
  }
}

function formatLineNumber(n: number | undefined, width: number): string {
  if (n === undefined) return " ".repeat(width)
  return String(n).padStart(width, " ")
}

const UnifiedView = (props: { lines: DiffLine[]; selectedHunkIndex: number }) => {
  let currentHunk = -1

  return (
    <scrollbox width="100%" height="100%">
      <box flexDirection="column" width="100%">
        <For each={props.lines}>
          {(line) => {
            if (line.type === "header") currentHunk++
            const isActiveHunk = currentHunk === props.selectedHunkIndex

            return (
              <box
                flexDirection="row"
                width="100%"
                bg={
                  isActiveHunk && line.type === "header"
                    ? "#1a1a3e"
                    : LINE_BG[line.type]
                }
              >
                <text fg="#555555" width={5}>
                  {formatLineNumber(line.oldLineNumber, 4)}
                </text>
                <text fg="#555555" width={5}>
                  {formatLineNumber(line.newLineNumber, 4)}
                </text>
                <text fg={LINE_COLORS[line.type]}>
                  {linePrefix(line.type)}{line.content}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </scrollbox>
  )
}

const SplitView = (props: { file: FileDiff }) => {
  const splitLines = createMemo(() => {
    const pairs: Array<{ left: DiffLine | null; right: DiffLine | null }> = []

    for (const hunk of props.file.hunks) {
      pairs.push({ left: { type: "header", content: hunk.header }, right: { type: "header", content: hunk.header } })

      const removes: DiffLine[] = []
      const adds: DiffLine[] = []

      for (const line of hunk.lines) {
        if (line.type === "remove") {
          removes.push(line)
        } else if (line.type === "add") {
          adds.push(line)
        } else {
          // flush paired removes/adds
          const max = Math.max(removes.length, adds.length)
          for (let i = 0; i < max; i++) {
            pairs.push({
              left: removes[i] ?? null,
              right: adds[i] ?? null,
            })
          }
          removes.length = 0
          adds.length = 0
          pairs.push({ left: line, right: line })
        }
      }

      const max = Math.max(removes.length, adds.length)
      for (let i = 0; i < max; i++) {
        pairs.push({
          left: removes[i] ?? null,
          right: adds[i] ?? null,
        })
      }
    }

    return pairs
  })

  return (
    <scrollbox width="100%" height="100%">
      <box flexDirection="column" width="100%">
        <For each={splitLines()}>
          {(pair) => (
            <box flexDirection="row" width="100%">
              <box width="50%" flexDirection="row">
                <text fg="#555555" width={5}>
                  {formatLineNumber(pair.left?.oldLineNumber, 4)}
                </text>
                <text
                  fg={pair.left ? LINE_COLORS[pair.left.type] : "#333333"}
                  bg={pair.left ? LINE_BG[pair.left.type] : undefined}
                  flexGrow={1}
                >
                  {pair.left ? `${linePrefix(pair.left.type)}${pair.left.content}` : ""}
                </text>
              </box>
              <text fg="#333333" width={1}>|</text>
              <box flexGrow={1} flexDirection="row">
                <text fg="#555555" width={5}>
                  {formatLineNumber(pair.right?.newLineNumber, 4)}
                </text>
                <text
                  fg={pair.right ? LINE_COLORS[pair.right.type] : "#333333"}
                  bg={pair.right ? LINE_BG[pair.right.type] : undefined}
                  flexGrow={1}
                >
                  {pair.right ? `${linePrefix(pair.right.type)}${pair.right.content}` : ""}
                </text>
              </box>
            </box>
          )}
        </For>
      </box>
    </scrollbox>
  )
}

export const DiffViewer = (props: DiffViewerProps) => {
  const allLines = createMemo(() => {
    if (!props.file) return []
    return flattenHunkLines(props.file.hunks)
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <Show when={props.file} fallback={
        <box width="100%" height="100%" justifyContent="center" alignItems="center">
          <text fg="#666666">No file selected</text>
        </box>
      }>
        {(file) => (
          <>
            <box flexDirection="row" width="100%" height={1} bg="#1a1a2e">
              <text fg="#87CEEB" bold>
                {" "}{file().newPath}
              </text>
              <text fg="#888888">
                {" "}({props.viewMode})
              </text>
            </box>
            <Show when={file().isBinary}>
              <text fg="#FF4444">Binary file differs</text>
            </Show>
            <Show when={!file().isBinary}>
              <Show when={props.viewMode === "unified"} fallback={
                <SplitView file={file()} />
              }>
                <UnifiedView lines={allLines()} selectedHunkIndex={props.selectedHunkIndex} />
              </Show>
            </Show>
          </>
        )}
      </Show>
    </box>
  )
}
