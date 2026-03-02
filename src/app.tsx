import { createSignal, Show } from "solid-js"
import { useKeyboard, useRenderer, useSelectionHandler } from "@opentui/solid"
import { UnifiedView } from "./components/unified-view"
import { HelpOverlay } from "./components/layout/help-overlay"

export const App = () => {
  const [showHelp, setShowHelp] = createSignal(false)
  const [selection, setSelection] = createSignal<any>(null)
  const renderer = useRenderer()

  useSelectionHandler((next) => {
    setSelection(next)
  })

  useKeyboard((key) => {
    const name = String(key.name ?? "").toLowerCase()
    if ((key.ctrl && key.shift && name === "c") || (key.ctrl && name === "insert")) {
      const text = selection()?.getSelectedText?.() ?? ""
      if (text) renderer.copyToClipboardOSC52(text)
      return
    }

    if (key.ctrl && (name === "?" || (name === "/" && key.shift))) {
      setShowHelp((v) => !v)
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <Show
        when={!showHelp()}
        fallback={<HelpOverlay onClose={() => setShowHelp(false)} />}
      >
        <UnifiedView />
      </Show>
    </box>
  )
}
