# Custodian

A local, git-based code review tool where a human reviewer collaborates with an AI model. Review uncommitted changes in a terminal UI, leave comments anchored to code, and let an AI respond, apply fixes, and resolve threads — all without leaving your repository.

<img width="3792" height="2060" alt="image" src="https://github.com/user-attachments/assets/f01847d2-382f-4935-ab50-b1de847785bf" />

## Why

Code review tools live on remote platforms. Custodian brings the review loop local: you review your own uncommitted work (or an AI's work) before it ever reaches a PR. The AI participates as a collaborator through MCP, reading your feedback and acting on it directly in the working tree.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                    Human (TUI)                      │
│  Browse files, view diffs, leave comments on lines  │
└──────────────────────┬──────────────────────────────┘
                       │
              .git/custodian/review.db
                       │
┌──────────────────────┴──────────────────────────────┐
│                  AI Model (MCP)                     │
│  Read threads, reply, edit files, resolve threads   │
└─────────────────────────────────────────────────────┘
```

1. Open the TUI and review uncommitted changes (staged, unstaged, untracked).
2. Comment on specific lines or ranges — threads are anchored to code content.
3. An AI model reads open threads through MCP tools.
4. The model replies with explanations or edits files to address feedback.
5. The model (or human) resolves threads. The human can reopen if unsatisfied.
6. The TUI live-refreshes to show new replies and file changes.

## Install

Requires Go 1.21+.

```bash
go install github.com/janjiss/custodian/cmd/custodian@latest
go install github.com/janjiss/custodian/cmd/custodian-mcp@latest
```

Or build from source:

```bash
git clone https://github.com/janjiss/custodian.git
cd custodian
go build -o custodian ./cmd/custodian
go build -o custodian-mcp ./cmd/custodian-mcp
```

## Usage

### TUI

Run inside any git repository:

```bash
custodian
```

#### Navigation

| Key | Action |
|-----|--------|
| `j/k` or `↑/↓` | Navigate files / diff lines |
| `Enter` / `Tab` | Open file diff / switch panes |
| `/` | Fuzzy search files or search within diff |
| `f` | Toggle between diff view and full source |
| `e` | Expand / collapse unchanged sections |
| `Ctrl+d` / `Ctrl+u` | Page down / up |
| `g` / `G` | Jump to top / bottom |
| `r` | Refresh file list |
| `q` | Quit |

#### Reviewing

| Key | Action |
|-----|--------|
| `c` | Comment on the current line |
| `v` | Start visual selection (then `j/k` to extend, `c` to comment on range) |
| `Enter` | Open thread detail on a commented line |
| `t` | Open thread list panel |
| `r` (in thread list/detail) | Resolve / reopen thread |
| `d` (in thread list) | Delete thread |
| `c` (in thread detail) | Reply to thread |
| `s` | Stage / unstage the selected file (marks it as reviewed) |

Comments appear as inline blocks below the commented line, showing the first comment, status, and reply count. Multi-line comments display a range bar (`┃`) alongside the covered lines.

Staged files show a green `✓` next to the change marker in the file list. Press `s` again to unstage.

### MCP Server

The MCP server lets AI models interact with your review session. It communicates over stdio and needs access to the git repository.

When run without arguments, `custodian-mcp` uses the current working directory to find the repo. You can also pass a path explicitly:

```bash
custodian-mcp /path/to/your/repo
```

#### Editor Configuration

**Cursor** — add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "custodian": {
      "command": "custodian-mcp",
      "args": ["/path/to/your/repo"]
    }
  }
}
```

**OpenCode** — add to `opencode.json` in your project:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "custodian": {
      "type": "local",
      "command": ["custodian-mcp", "/path/to/your/repo"],
      "enabled": true
    }
  }
}
```

> **Note:** Some editors set the working directory to the project root when launching MCP servers. In that case the path argument is optional, but it's safer to always include it.

#### Available Tools

| Tool | Description |
|------|-------------|
| `review_list_changes` | List uncommitted file changes (path, kind, symbol) |
| `review_list_threads` | List threads, optionally filtered by file and status |
| `review_reply_thread` | Post a reply to a thread |
| `review_resolve_thread` | Mark a thread as resolved |
| `review_reopen_thread` | Reopen a resolved thread |
| `review_apply_edit` | Write new content to a file |
| `review_stage_file` | Stage a file (git add) to mark it as reviewed |
| `review_unstage_file` | Unstage a file (git reset) to unmark it as reviewed |

## Architecture

```
cmd/
  custodian/          CLI entry point (TUI)
  custodian-mcp/      CLI entry point (MCP stdio server)
internal/
  git/                Git operations (status, diff, file reading)
  log/                Debug logging to .git/custodian/debug.log
  mcp/                MCP tool definitions and handlers
  review/             Types, thread anchoring and relocation
  store/              SQLite persistence (sessions, threads, comments)
  tui/                Bubble Tea application, diff rendering, styles
```

### Storage

All review data is stored in `.git/custodian/review.db` (SQLite, WAL mode). This keeps review state local to the repository and out of version control. Debug logs go to `.git/custodian/debug.log`.

### Comment Anchoring

Threads are anchored to code content, not just line numbers. When the underlying file changes, custodian relocates threads by searching for matching content within a window around the original position. If an exact match isn't found, it falls back to context-based matching and marks the thread as outdated — similar to how GitHub handles stale review comments.

## License

MIT
