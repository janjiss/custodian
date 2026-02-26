import { render } from "@opentui/solid"
import { App } from "./app"
import { getConfig } from "./core/config"
import { getDb } from "./db/migrate"

const args = process.argv.slice(2)

if (args.includes("-h") || args.includes("--help")) {
  console.log(`
custodian - AI coding agent with diff review

Usage: custodian [options]

Options:
  -c, --cwd <path>    Set working directory
  -m, --mode <mode>   Start in mode: review, agent, combined
  -h, --help          Show this help
  -v, --version       Show version

Modes:
  review    - Full-screen diff review (git changes & agent changes)
  agent     - Chat with AI agent (connects to opencode server)
  combined  - Split view: file changes + agent chat

Keyboard:
  Tab          Cycle between modes
  1 / 2 / 3   Jump to Review / Agent / Combined
  Ctrl+?       Toggle help overlay
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

getConfig()
getDb()

render(App)
