import { createSignal, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { UnifiedView } from "./components/unified-view"
import { HelpOverlay } from "./components/layout/help-overlay"

export const App = () => {
  const [showHelp, setShowHelp] = createSignal(false)

  useKeyboard((key) => {
    const name = String(key.name ?? "").toLowerCase()
    const alt = key.meta || (key as any).alt === true
    if ((alt && (name === "?" || (name === "/" && key.shift))) || (key.ctrl && (name === "?" || (name === "/" && key.shift)))) {
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
