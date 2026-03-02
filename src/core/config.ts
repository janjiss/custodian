import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { Mode } from "../app"

export interface ProviderConfig {
  apiKey?: string
  disabled?: boolean
}

export interface CustodianConfig {
  defaultMode: Mode
  diffStyle: "unified" | "split"
  theme: "dark" | "light"
  opencode: {
    serverUrl: string
  }
  providers: Record<string, ProviderConfig>
  git: {
    pollInterval: number
  }
  keybindings: {
    leader: string
    leaderTimeoutMs: number
  }
  terminal: {
    useMouse: boolean
  }
}

const DEFAULT_CONFIG: CustodianConfig = {
  defaultMode: "review",
  diffStyle: "unified",
  theme: "dark",
  opencode: {
    serverUrl: "http://localhost:4096",
  },
  providers: {},
  git: {
    pollInterval: 3000,
  },
  keybindings: {
    leader: "ctrl+g",
    leaderTimeoutMs: 1000,
  },
  terminal: {
    useMouse: true,
  },
}

function findConfigFile(): string | null {
  const candidates = [
    join(process.cwd(), ".custodian.json"),
    join(
      process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
      "custodian",
      "config.json",
    ),
    join(homedir(), ".custodian.json"),
  ]

  for (const path of candidates) {
    if (existsSync(path)) return path
  }

  return null
}

function loadFile(path: string): Partial<CustodianConfig> {
  try {
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function merge(base: CustodianConfig, overrides: Partial<CustodianConfig>): CustodianConfig {
  return {
    ...base,
    ...overrides,
    opencode: {
      ...base.opencode,
      ...(overrides.opencode ?? {}),
    },
    providers: {
      ...base.providers,
      ...(overrides.providers ?? {}),
    },
    git: {
      ...base.git,
      ...(overrides.git ?? {}),
    },
    keybindings: {
      ...base.keybindings,
      ...(overrides.keybindings ?? {}),
    },
    terminal: {
      ...base.terminal,
      ...(overrides.terminal ?? {}),
    },
  }
}

let _config: CustodianConfig | null = null

export function getConfig(): CustodianConfig {
  if (_config) return _config

  const configPath = findConfigFile()
  if (configPath) {
    const overrides = loadFile(configPath)
    _config = merge(DEFAULT_CONFIG, overrides)
  } else {
    _config = { ...DEFAULT_CONFIG }
  }

  return _config
}

export function getDataDir(): string {
  const dir = join(process.cwd(), ".custodian")
  if (!existsSync(dir)) {
    Bun.spawnSync(["mkdir", "-p", dir])
  }
  return dir
}

const MODEL_FILE = "last-model.json"
const SESSION_FILE = "last-session.json"

export function saveLastModel(providerID: string, modelID: string): void {
  const path = join(getDataDir(), MODEL_FILE)
  writeFileSync(path, JSON.stringify({ providerID, modelID }))
}

export function loadLastModel(): { providerID: string; modelID: string } | null {
  const path = join(getDataDir(), MODEL_FILE)
  try {
    if (!existsSync(path)) return null
    const data = JSON.parse(readFileSync(path, "utf-8"))
    if (data?.providerID && data?.modelID) return data
    return null
  } catch {
    return null
  }
}

export function clearLastModel(): void {
  const path = join(getDataDir(), MODEL_FILE)
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {}
}

export function saveLastSessionId(sessionId: string): void {
  const path = join(getDataDir(), SESSION_FILE)
  writeFileSync(path, JSON.stringify({ sessionId }))
}

export function loadLastSessionId(): string | null {
  const path = join(getDataDir(), SESSION_FILE)
  try {
    if (!existsSync(path)) return null
    const data = JSON.parse(readFileSync(path, "utf-8"))
    if (typeof data?.sessionId === "string" && data.sessionId.trim()) return data.sessionId
    return null
  } catch {
    return null
  }
}

export function clearLastSessionId(): void {
  const path = join(getDataDir(), SESSION_FILE)
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {}
}
