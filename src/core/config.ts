import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { Mode } from "../app"

export interface CustodianConfig {
  defaultMode: Mode
  diffStyle: "unified" | "split"
  theme: "dark" | "light"
  opencode: {
    serverUrl: string
  }
  git: {
    pollInterval: number
  }
  keybindings: Record<string, string>
}

const DEFAULT_CONFIG: CustodianConfig = {
  defaultMode: "review",
  diffStyle: "unified",
  theme: "dark",
  opencode: {
    serverUrl: "http://localhost:4096",
  },
  git: {
    pollInterval: 3000,
  },
  keybindings: {},
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
    git: {
      ...base.git,
      ...(overrides.git ?? {}),
    },
    keybindings: {
      ...base.keybindings,
      ...(overrides.keybindings ?? {}),
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
