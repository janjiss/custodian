import { render } from "@opentui/solid"
import { App } from "./app"
import { getConfig } from "./core/config"
import { getDb } from "./db/migrate"
import { getAgentClient } from "./core/agent"
import { ThemeProvider } from "./theme/engine"

const args = process.argv.slice(2)

if (args.includes("-h") || args.includes("--help")) {
  console.log(`
custodian - AI coding agent with diff review

Usage: custodian [options]

Options:
  -c, --cwd <path>    Set working directory
  --login             Open provider login on startup
  -h, --help          Show this help
  -v, --version       Show version

Authentication:
  Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY
  as environment variables, or use Ctrl+L to login interactively.

Layout:
  Three-pane view: Files | Diff | Chat
  Chat pane appears when files are added to context.

Keyboard:
  Ctrl+?       Toggle help overlay
  Ctrl+G then S/N/M/L/R/K/T/Y/.   Leader actions (configurable)
  /sessions    Session picker slash command
  Ctrl+C       Quit
`)
  process.exit(0)
}

if (args.includes("-v") || args.includes("--version")) {
  console.log("custodian 0.1.0")
  process.exit(0)
}

const cwdIdx = args.findIndex((a) => a === "-c" || a === "--cwd")
if (cwdIdx >= 0 && args[cwdIdx + 1]) {
  process.chdir(args[cwdIdx + 1])
}

const config = getConfig()
getDb()

const cleanup = () => {
  try { getAgentClient().shutdown() } catch {}
}
process.on("exit", cleanup)
process.on("SIGINT", () => { cleanup(); process.exit(0) })
process.on("SIGTERM", () => { cleanup(); process.exit(0) })

render(() => (
  <ThemeProvider>
    <App />
  </ThemeProvider>
), {
  exitOnCtrlC: true,
  useMouse: config.terminal.useMouse,
  useKittyKeyboard: {
    disambiguate: true,
    alternateKeys: true,
  },
})
