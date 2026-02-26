import { useKeyboard } from "@opentui/solid"

interface HelpOverlayProps {
  onClose: () => void
}

const HELP_SECTIONS = [
  {
    title: "Global",
    bindings: [
      ["Tab", "Cycle mode"],
      ["1 / 2 / 3", "Jump to Review / Agent / Combined"],
      ["Ctrl+N", "New session"],
      ["Ctrl+A", "Switch session"],
      ["Ctrl+O", "Select model"],
      ["Ctrl+?", "Toggle help"],
      ["Ctrl+C", "Quit"],
    ],
  },
  {
    title: "Review Mode",
    bindings: [
      ["j / k", "Navigate files"],
      ["n / N", "Next / previous hunk"],
      ["Enter", "Expand file"],
      ["u", "Toggle unified / split view"],
      ["a", "Accept / stage change"],
      ["r", "Reject / revert hunk"],
      ["s", "Toggle staged / unstaged"],
    ],
  },
  {
    title: "Agent Mode",
    bindings: [
      ["Ctrl+S", "Send message"],
      ["Ctrl+X", "Cancel generation"],
      ["Ctrl+E", "External editor"],
    ],
  },
  {
    title: "Combined Mode",
    bindings: [
      ["h / l", "Switch pane focus"],
      ["Ctrl+R", "Toggle review panel"],
      ["Enter", "Full diff overlay"],
    ],
  },
]

export const HelpOverlay = (props: HelpOverlayProps) => {
  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "?")) {
      props.onClose()
    }
  })

  return (
    <box
      position="absolute"
      top={2}
      left={4}
      right={4}
      bottom={4}
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
              <text fg="#87CEEB" width={20}>
                {key}
              </text>
              <text fg="#cccccc">{desc}</text>
            </box>
          ))}
        </box>
      ))}
      <text fg="#666666">Press Esc or Ctrl+? to close</text>
    </box>
  )
}
