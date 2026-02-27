# Custodian

Terminal-first AI coding assistant with a three-pane workflow: files, diff, and chat.

## What it does

- Reviews git changes in a built-in diff viewer.
- Lets you chat with an OpenCode-compatible agent.
- Supports model/provider selection and interactive provider login.
- Keeps chat sessions persistent and switchable (`/sessions`).

## Requirements

- [Bun](https://bun.sh) (runtime + build)
- Git repository as working directory
- At least one model provider configured (via API key env vars or in-app login)

## Quick start

```bash
bun install
bun run dev
```

## Build

Bundle output:

```bash
bun run build
```

Standalone binary (example target):

```bash
bun run compile bun-linux-x64
```

## CLI usage

```bash
custodian [options]

Options:
  -c, --cwd <path>    Set working directory
  --login             Open provider login on startup
  -h, --help          Show help
  -v, --version       Show version
```

## Keyboard (Alt-first)

- `Alt+?` or `Ctrl+?`: help
- `Esc`: cancel active generation/prompt
- `Alt+S`: open sessions (`/sessions` also supported)
- `Alt+N`: new session
- `Alt+M`: model selector
- `Alt+L`: provider login
- `Alt+R`: refresh diffs
- `Alt+K`: compact session
- `Alt+T` / `Alt+Y`: toggle thinking/tool details
- `Alt+.`: cycle focused pane
- `Alt+Enter`: expand/collapse focused pane
- `Alt+[` / `Alt+]`: resize focused pane

## Session persistence

- Last selected model and session are stored under `.custodian/`.
- Session picker is available via slash command: `/sessions`.

## Notes

- `dist/`, `node_modules/`, and `.custodian/` are git-ignored.
- Use GitHub SSH remote: `git@github.com:janjiss/custodian.git`.
