import { useKeyboard } from "@opentui/solid"

export type KeyHandler = (key: {
  name: string
  ctrl: boolean
  meta: boolean
  shift: boolean
}) => boolean | void

export function useKeybindings(handlers: Record<string, () => void>) {
  useKeyboard((key) => {
    const combo = buildCombo(key)
    const handler = handlers[combo]
    if (handler) handler()
  })
}

function buildCombo(key: { name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): string {
  const parts: string[] = []
  if (key.ctrl) parts.push("ctrl")
  if (key.meta) parts.push("meta")
  if (key.shift) parts.push("shift")
  parts.push(key.name)
  return parts.join("+")
}
