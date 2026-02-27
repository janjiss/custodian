import { useKeyboard } from "@opentui/solid"

interface HelpOverlayProps {
  onClose: () => void
}

const HELP_SECTIONS = [
  {
    title: "Global",
    bindings: [
      ["Alt+? / Ctrl+?", "Toggle help"],
      ["Esc", "Cancel streaming / active prompt"],
      ["Ctrl+C", "Quit"],
    ],
  },
  {
    title: "Panes",
    bindings: [
      ["Alt+.", "Cycle pane focus (Files → Chat → Diff)"],
      ["Alt+Enter", "Expand / collapse focused pane"],
      ["Alt+[ / Alt+]", "Resize focused pane -/+"],
      ["Ctrl+Tab / Alt+Tab", "Cycle pane focus (fallback)"],
      ["Ctrl+[ / Ctrl+]", "Resize focused pane (fallback)"],
    ],
  },
  {
    title: "Files Pane",
    bindings: [
      ["j / k / Up / Down", "Navigate files"],
      ["Space / Enter", "Toggle file in chat context"],
      ["Shift+A", "Add all files to context"],
      ["Shift+C", "Clear context"],
      ["a", "Stage file"],
      ["r", "Revert file"],
      ["s", "Toggle staged / unstaged"],
      ["w / Shift+S", "Working tree / staged diffs"],
    ],
  },
  {
    title: "Diff Pane",
    bindings: [
      ["j / k / Up / Down", "Navigate files"],
      ["n / Shift+N", "Next / previous hunk"],
      ["u", "Toggle unified / split view"],
    ],
  },
  {
    title: "Chat & Agent",
    bindings: [
      ["Enter / Shift+Enter", "Send message / newline"],
      ["/", "Slash commands (type / then filter)"],
      ["Tab", "Autocomplete selected slash command"],
      ["Ctrl+P / Ctrl+N", "Input history and menu navigation"],
      ["Ctrl+D", "Toggle diff context in messages"],
      ["Ctrl+X", "Cancel generation / current task"],
      ["Alt+S / /sessions", "Session switcher"],
      ["Alt+M", "Model selector"],
      ["Alt+L", "Provider login"],
      ["Alt+R", "Refresh diffs"],
      ["Alt+K", "Compact session"],
      ["Alt+T / Alt+Y", "Toggle thinking / tool details"],
      ["Alt+N", "New session"],
    ],
  },
  {
    title: "Permission Prompts",
    bindings: [
      ["y", "Approve once"],
      ["a", "Approve always"],
      ["n", "Reject"],
      ["Left / Right (h / l)", "Change selection"],
      ["Enter", "Confirm selected option"],
    ],
  },
  {
    title: "Question Prompts",
    bindings: [
      ["Left / Right / Up / Down", "Change selection"],
      ["h / l / k / j", "Vim-style selection"],
      ["Enter", "Submit selected answer"],
      ["Esc", "Reject question"],
    ],
  },
]

export const HelpOverlay = (props: HelpOverlayProps) => {
  useKeyboard((key) => {
    const name = String(key.name ?? "").toLowerCase()
    const alt = key.meta || (key as any).alt === true
    if (name === "escape" || (alt && (name === "?" || (name === "/" && key.shift))) || (key.ctrl && (name === "?" || (name === "/" && key.shift)))) {
      props.onClose()
    }
  })

  return (
    <box
      width="100%"
      height="100%"
      bg="#1a1a2e"
      flexDirection="column"
      padding={2}
    >
    <box
      width="100%"
      flexGrow={1}
      borderStyle="rounded"
      padding={1}
      flexDirection="column"
      gap={1}
      bg="#1a1a2e"
    >
      <text fg="#87CEEB" bold>
        Custodian -- Keyboard Shortcuts
      </text>
      {HELP_SECTIONS.map((section) => (
        <box flexDirection="column">
          <text fg="#FFFF00" bold>
            {section.title}
          </text>
          {section.bindings.map(([key, desc]) => (
            <box flexDirection="row" gap={2}>
              <text fg="#87CEEB" width={38}>
                {key}
              </text>
              <text fg="#cccccc">{desc}</text>
            </box>
          ))}
        </box>
      ))}
      <text fg="#666666">Press Esc, Alt+?, or Ctrl+? to close</text>
    </box>
    </box>
  )
}
