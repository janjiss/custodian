# Custodian

Terminal-first AI coding assistant with a three-pane workflow: files, diff, and chat.

<img width="3792" height="2060" alt="image" src="https://github.com/user-attachments/assets/b2be21df-892e-40f5-8aea-41dcd6bc86b1" />

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

## Keyboard

- `Ctrl+?`: help
- `Esc`: cancel active generation/prompt
- `/sessions`: open session picker from chat slash command
- `Ctrl+Tab`: cycle focused pane (fallback)
- `Ctrl+[ / Ctrl+]`: resize focused pane (fallback)

## Configurable leader key

Custodian reads config from `~/.config/custodian/config.json` (or `.custodian.json` in project root).

You can configure the leader combo and timeout used for global shortcuts:

```json
{
  "keybindings": {
    "leader": "ctrl+g",
    "leaderTimeoutMs": 1000
  }
}
```

Supported modifier tokens in `leader`: `ctrl`, `alt`, `shift`, `meta` (or `cmd`).

Leader actions:

- `<leader> s`: sessions
- `<leader> n`: new session
- `<leader> m`: model selector
- `<leader> l`: login
- `<leader> r`: refresh diffs
- `<leader> k`: compact session
- `<leader> t` / `<leader> y`: thinking/tool details
- `<leader> .`: cycle pane
- `<leader> Enter`: expand/collapse pane
- `<leader> [` / `<leader> ]`: resize pane

## Session persistence

- Last selected model and session are stored under `.custodian/`.
- Session picker is available via slash command: `/sessions`.

## Notes

- `dist/`, `node_modules/`, and `.custodian/` are git-ignored.
- Use GitHub SSH remote: `git@github.com:janjiss/custodian.git`.

## GitHub SSH setup

If `git push` fails with `Permission denied (publickey)`, configure a dedicated key:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "Janis Miezitis <janjiss@gmail.com>" -f ~/.ssh/id_ed25519_github_janjiss -N ""
cat ~/.ssh/id_ed25519_github_janjiss.pub
```

Add the printed public key in GitHub: **Settings -> SSH and GPG keys -> New SSH key**.

Then set SSH config so Git always uses the correct key:

```sshconfig
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github_janjiss
  IdentitiesOnly yes
```

Optional first-connection check:

```bash
ssh -T git@github.com
```
