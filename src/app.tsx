import { createSignal, Show } from "solid-js"
import { AppShell } from "./components/layout/app-shell"
import { ReviewMode } from "./components/review/review-mode"
import { AgenticMode } from "./components/agent/agentic-mode"
import { CombinedMode } from "./components/combined/combined-view"
import { getConfig } from "./core/config"

export type Mode = "review" | "agent" | "combined"

const MODE_ORDER: Mode[] = ["review", "agent", "combined"]

export const App = () => {
  const config = getConfig()

  const args = process.argv.slice(2)
  const modeArg = args.find((_, i, a) => a[i - 1] === "-m" || a[i - 1] === "--mode")
  const initialMode = (modeArg as Mode) ?? config.defaultMode

  const [mode, setMode] = createSignal<Mode>(initialMode)
  const [showHelp, setShowHelp] = createSignal(false)

  const cycleMode = () => {
    const current = MODE_ORDER.indexOf(mode())
    setMode(MODE_ORDER[(current + 1) % MODE_ORDER.length])
  }

  const jumpToMode = (m: Mode) => setMode(m)

  return (
    <AppShell
      mode={mode()}
      onCycleMode={cycleMode}
      onJumpToMode={jumpToMode}
      showHelp={showHelp()}
      onToggleHelp={() => setShowHelp((v) => !v)}
    >
      <Show when={mode() === "review"}>
        <ReviewMode />
      </Show>
      <Show when={mode() === "agent"}>
        <AgenticMode />
      </Show>
      <Show when={mode() === "combined"}>
        <CombinedMode />
      </Show>
    </AppShell>
  )
}
