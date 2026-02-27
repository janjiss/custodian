import { RGBA } from "@opentui/core"
import { createContext, useContext, createMemo, type JSX } from "solid-js"
import { readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { getConfig } from "../core/config"

type ThemeMode = "dark" | "light"
type ColorValue = string | { dark: string; light: string } | number
type ThemeJson = {
  defs?: Record<string, string>
  theme: Record<string, ColorValue>
}

export type ThemeColors = {
  primary: RGBA
  secondary: RGBA
  accent: RGBA
  error: RGBA
  warning: RGBA
  success: RGBA
  info: RGBA
  text: RGBA
  textMuted: RGBA
  selectedListItemText: RGBA
  background: RGBA
  backgroundPanel: RGBA
  backgroundElement: RGBA
  backgroundMenu: RGBA
  border: RGBA
  borderActive: RGBA
  borderSubtle: RGBA
  diffAdded: RGBA
  diffRemoved: RGBA
  diffContext: RGBA
  markdownText: RGBA
  markdownHeading: RGBA
  markdownLink: RGBA
  markdownCode: RGBA
}

const defaultHex = "#000000"

function resolveTheme(themeJson: ThemeJson, mode: ThemeMode): ThemeColors {
  const defs = themeJson.defs ?? {}
  const resolve = (value: ColorValue): RGBA => {
    if (typeof value === "number") return ansiToRgba(value)
    if (typeof value === "string") {
      if (value === "transparent" || value === "none") return RGBA.fromInts(0, 0, 0, 0)
      if (value.startsWith("#")) return RGBA.fromHex(value)
      if (defs[value]) return resolve(defs[value])
      const themeRef = themeJson.theme[value]
      if (themeRef !== undefined) return resolve(themeRef)
      return RGBA.fromHex(defaultHex)
    }
    return resolve(value[mode])
  }

  const pick = (key: string, fallback: string) => {
    const value = themeJson.theme[key]
    if (value === undefined) return RGBA.fromHex(fallback)
    return resolve(value)
  }

  return {
    primary: pick("primary", "#87CEEB"),
    secondary: pick("secondary", "#c678dd"),
    accent: pick("accent", "#61afef"),
    error: pick("error", "#e06c75"),
    warning: pick("warning", "#e5c07b"),
    success: pick("success", "#98c379"),
    info: pick("info", "#61afef"),
    text: pick("text", "#d7dee9"),
    textMuted: pick("textMuted", "#808080"),
    selectedListItemText: pick("selectedListItemText", "#000000"),
    background: pick("background", "#0d1117"),
    backgroundPanel: pick("backgroundPanel", "#111827"),
    backgroundElement: pick("backgroundElement", "#0f172a"),
    backgroundMenu: pick("backgroundMenu", "#111827"),
    border: pick("border", "#334155"),
    borderActive: pick("borderActive", "#7aa2f7"),
    borderSubtle: pick("borderSubtle", "#1f2937"),
    diffAdded: pick("diffAdded", "#98c379"),
    diffRemoved: pick("diffRemoved", "#e06c75"),
    diffContext: pick("diffContext", "#6b7280"),
    markdownText: pick("markdownText", "#d1d5db"),
    markdownHeading: pick("markdownHeading", "#e5e7eb"),
    markdownLink: pick("markdownLink", "#61afef"),
    markdownCode: pick("markdownCode", "#98c379"),
  }
}

function ansiToRgba(code: number): RGBA {
  if (code < 16) {
    const ansi = [
      "#000000", "#800000", "#008000", "#808000",
      "#000080", "#800080", "#008080", "#c0c0c0",
      "#808080", "#ff0000", "#00ff00", "#ffff00",
      "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
    ]
    return RGBA.fromHex(ansi[code] ?? "#000000")
  }
  if (code < 232) {
    const i = code - 16
    const b = i % 6
    const g = Math.floor(i / 6) % 6
    const r = Math.floor(i / 36)
    const v = (x: number) => (x === 0 ? 0 : x * 40 + 55)
    return RGBA.fromInts(v(r), v(g), v(b))
  }
  if (code < 256) {
    const gray = (code - 232) * 10 + 8
    return RGBA.fromInts(gray, gray, gray)
  }
  return RGBA.fromInts(0, 0, 0)
}

function rgbaToHex(color: RGBA): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, "0")
  const g = Math.round(color.g * 255).toString(16).padStart(2, "0")
  const b = Math.round(color.b * 255).toString(16).padStart(2, "0")
  return `#${r}${g}${b}`
}

function loadThemePack(): Record<string, ThemeJson> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "themes")
  const entries = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const result: Record<string, ThemeJson> = {}
  for (const entry of entries) {
    const raw = readFileSync(join(dir, entry), "utf-8")
    result[entry.replace(/\.json$/, "")] = JSON.parse(raw) as ThemeJson
  }
  return result
}

type ThemeContextValue = {
  colors: () => ThemeColors
  color: (key: keyof ThemeColors) => string
  mode: () => ThemeMode
  selected: () => string
  available: () => string[]
}

const ThemeContext = createContext<ThemeContextValue>()

export const ThemeProvider = (props: { children: JSX.Element }) => {
  const themePack = loadThemePack()
  const cfg = getConfig()
  const mode = (cfg.theme ?? "dark") as ThemeMode
  const selected = process.env.CUSTODIAN_THEME ?? "opencode"
  const active = themePack[selected] ? selected : "opencode"
  const colors = createMemo(() => resolveTheme(themePack[active], mode))

  const value: ThemeContextValue = {
    colors,
    color: (key) => rgbaToHex(colors()[key]),
    mode: () => mode,
    selected: () => active,
    available: () => Object.keys(themePack).sort(),
  }

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}

export function tint(base: RGBA, overlay: RGBA, alpha: number): RGBA {
  const r = base.r + (overlay.r - base.r) * alpha
  const g = base.g + (overlay.g - base.g) * alpha
  const b = base.b + (overlay.b - base.b) * alpha
  return RGBA.fromInts(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255))
}

export function selectedForeground(bg: RGBA): RGBA {
  const lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b
  return lum > 0.5 ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
}
