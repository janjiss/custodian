import { getConfig } from "./config"

export interface KeyCombo {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}

export interface LeaderConfig {
  combo: KeyCombo
  label: string
  timeoutMs: number
}

type KeyboardLike = {
  name?: string
  sequence?: string
  ch?: string
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  alt?: boolean
}

function normalizeKeyName(value: string): string {
  const v = value.trim().toLowerCase()
  if (v === "return") return "enter"
  if (v === "\r" || v === "\n") return "enter"
  if (v === " ") return "space"
  return v
}

export function getKeyName(key: KeyboardLike): string {
  const primary = String(key.name ?? "")
  if (primary) return normalizeKeyName(primary)

  const sequence = String(key.sequence ?? "")
  if (sequence) return normalizeKeyName(sequence)

  const ch = String(key.ch ?? "")
  if (ch) return normalizeKeyName(ch)

  return ""
}

export function parseKeyCombo(input: string, fallback = "ctrl+g"): KeyCombo {
  const source = (input || fallback).trim().toLowerCase()
  const parts = source.split("+").map((p) => p.trim()).filter(Boolean)

  let ctrl = false
  let alt = false
  let shift = false
  let key = ""

  for (const part of parts) {
    if (part === "ctrl" || part === "control") {
      ctrl = true
      continue
    }
    if (part === "alt" || part === "option") {
      alt = true
      continue
    }
    if (part === "shift") {
      shift = true
      continue
    }
    if (part === "cmd" || part === "command" || part === "meta") {
      alt = true
      continue
    }
    key = normalizeKeyName(part)
  }

  if (!key) {
    return parseKeyCombo(fallback, "ctrl+g")
  }

  return { key, ctrl, alt, shift }
}

export function keyMatches(combo: KeyCombo, key: KeyboardLike): boolean {
  const name = getKeyName(key)
  const altPressed = Boolean(key.meta || key.alt)
  return name === combo.key
    && Boolean(key.ctrl) === Boolean(combo.ctrl)
    && altPressed === Boolean(combo.alt)
    && Boolean(key.shift) === Boolean(combo.shift)
}

export function formatKeyCombo(combo: KeyCombo): string {
  const parts: string[] = []
  if (combo.ctrl) parts.push("Ctrl")
  if (combo.alt) parts.push("Alt")
  if (combo.shift) parts.push("Shift")
  parts.push(combo.key.toUpperCase())
  return parts.join("+")
}

export function getLeaderConfig(): LeaderConfig {
  const cfg = getConfig().keybindings
  const combo = parseKeyCombo(cfg.leader || "ctrl+g")
  const timeoutMs = Number(cfg.leaderTimeoutMs) > 0 ? Number(cfg.leaderTimeoutMs) : 1000
  return {
    combo,
    label: formatKeyCombo(combo),
    timeoutMs,
  }
}
