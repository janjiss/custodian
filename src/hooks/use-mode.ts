import { createSignal } from "solid-js"
import type { Mode } from "../app"

export function useMode(initial: Mode = "review") {
  const [mode, setMode] = createSignal<Mode>(initial)

  const MODES: Mode[] = ["review", "agent", "combined"]

  const cycle = () => {
    const idx = MODES.indexOf(mode())
    setMode(MODES[(idx + 1) % MODES.length])
  }

  return { mode, setMode, cycle }
}
