import { Show, createMemo } from "solid-js"
import { SyntaxStyle, RGBA } from "@opentui/core"
import type { FileDiff } from "../../core/diff"
import { filetypeFromPath } from "../../core/diff"

interface DiffViewerProps {
  file: FileDiff | null
  viewMode: "unified" | "split"
  selectedHunkIndex: number
}

let _syntaxStyle: SyntaxStyle | null = null

function getSyntaxStyle(): SyntaxStyle {
  if (!_syntaxStyle) {
    _syntaxStyle = SyntaxStyle.fromStyles({
      "keyword":              { fg: RGBA.fromHex("#c678dd") },
      "keyword.function":     { fg: RGBA.fromHex("#c678dd") },
      "keyword.return":       { fg: RGBA.fromHex("#c678dd") },
      "keyword.operator":     { fg: RGBA.fromHex("#c678dd") },
      "keyword.import":       { fg: RGBA.fromHex("#c678dd") },
      "keyword.export":       { fg: RGBA.fromHex("#c678dd") },
      "keyword.type":         { fg: RGBA.fromHex("#c678dd") },
      "keyword.conditional":  { fg: RGBA.fromHex("#c678dd") },
      "keyword.repeat":       { fg: RGBA.fromHex("#c678dd") },
      "keyword.exception":    { fg: RGBA.fromHex("#c678dd") },

      "string":               { fg: RGBA.fromHex("#98c379") },
      "string.special":       { fg: RGBA.fromHex("#98c379") },
      "string.escape":        { fg: RGBA.fromHex("#56b6c2") },
      "string.regex":         { fg: RGBA.fromHex("#e06c75") },

      "comment":              { fg: RGBA.fromHex("#5c6370"), italic: true },
      "comment.line":         { fg: RGBA.fromHex("#5c6370"), italic: true },
      "comment.block":        { fg: RGBA.fromHex("#5c6370"), italic: true },

      "function":             { fg: RGBA.fromHex("#61afef") },
      "function.call":        { fg: RGBA.fromHex("#61afef") },
      "function.method":      { fg: RGBA.fromHex("#61afef") },
      "function.builtin":     { fg: RGBA.fromHex("#61afef") },
      "function.macro":       { fg: RGBA.fromHex("#61afef") },
      "method":               { fg: RGBA.fromHex("#61afef") },

      "variable":             { fg: RGBA.fromHex("#e06c75") },
      "variable.builtin":     { fg: RGBA.fromHex("#e06c75") },
      "variable.parameter":   { fg: RGBA.fromHex("#e06c75") },
      "variable.member":      { fg: RGBA.fromHex("#e06c75") },

      "type":                 { fg: RGBA.fromHex("#e5c07b") },
      "type.builtin":         { fg: RGBA.fromHex("#e5c07b") },
      "type.definition":      { fg: RGBA.fromHex("#e5c07b") },
      "type.qualifier":       { fg: RGBA.fromHex("#e5c07b") },

      "constructor":          { fg: RGBA.fromHex("#e5c07b") },
      "class":                { fg: RGBA.fromHex("#e5c07b") },
      "interface":            { fg: RGBA.fromHex("#e5c07b") },

      "constant":             { fg: RGBA.fromHex("#d19a66") },
      "constant.builtin":     { fg: RGBA.fromHex("#d19a66") },
      "boolean":              { fg: RGBA.fromHex("#d19a66") },
      "number":               { fg: RGBA.fromHex("#d19a66") },
      "float":                { fg: RGBA.fromHex("#d19a66") },

      "operator":             { fg: RGBA.fromHex("#56b6c2") },
      "punctuation":          { fg: RGBA.fromHex("#abb2bf") },
      "punctuation.bracket":  { fg: RGBA.fromHex("#abb2bf") },
      "punctuation.delimiter":{ fg: RGBA.fromHex("#abb2bf") },
      "punctuation.special":  { fg: RGBA.fromHex("#56b6c2") },

      "property":             { fg: RGBA.fromHex("#e06c75") },
      "field":                { fg: RGBA.fromHex("#e06c75") },
      "attribute":            { fg: RGBA.fromHex("#e5c07b") },
      "label":                { fg: RGBA.fromHex("#e06c75") },
      "namespace":            { fg: RGBA.fromHex("#e5c07b") },
      "module":               { fg: RGBA.fromHex("#e5c07b") },

      "tag":                  { fg: RGBA.fromHex("#e06c75") },
      "tag.attribute":        { fg: RGBA.fromHex("#d19a66") },
      "tag.delimiter":        { fg: RGBA.fromHex("#abb2bf") },

      "text":                 { fg: RGBA.fromHex("#abb2bf") },
      "text.title":           { fg: RGBA.fromHex("#e06c75"), bold: true },
      "text.uri":             { fg: RGBA.fromHex("#61afef"), underline: true },
      "text.emphasis":        { italic: true },
      "text.strong":          { bold: true },

      "default":              { fg: RGBA.fromHex("#abb2bf") },
    })
  }
  return _syntaxStyle
}

export const DiffViewer = (props: DiffViewerProps) => {
  const filetype = createMemo(() => {
    if (!props.file) return undefined
    return filetypeFromPath(props.file.newPath)
  })

  const rawDiff = createMemo(() => {
    if (!props.file) return ""
    return props.file.rawDiff
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
                {" "}({props.viewMode}){filetype() ? ` [${filetype()}]` : ""}
              </text>
            </box>
            <Show when={file().isBinary}>
              <text fg="#FF4444">Binary file differs</text>
            </Show>
            <Show when={!file().isBinary && rawDiff()}>
              <diff
                diff={rawDiff()}
                view={props.viewMode}
                filetype={filetype()}
                syntaxStyle={getSyntaxStyle()}
                showLineNumbers={true}
                selectable
                flexGrow={1}
                width="100%"
                addedBg="#002200"
                removedBg="#220000"
                addedSignColor="#00FF00"
                removedSignColor="#FF4444"
                lineNumberFg="#555555"
                wrapMode="none"
              />
            </Show>
          </>
        )}
      </Show>
    </box>
  )
}
