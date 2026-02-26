import { useKeyboard } from "@opentui/solid"

interface PermissionDialogProps {
  toolName: string
  description: string
  onApprove: () => void
  onDeny: () => void
  onApproveSession: () => void
}

export const PermissionDialog = (props: PermissionDialogProps) => {
  useKeyboard((key) => {
    if (key.name === "a" && !key.shift) {
      props.onApprove()
    } else if (key.name === "A" || (key.name === "a" && key.shift)) {
      props.onApproveSession()
    } else if (key.name === "d") {
      props.onDeny()
    }
  })

  return (
    <box
      position="absolute"
      top="30%"
      left="20%"
      right="20%"
      borderStyle="rounded"
      borderColor="#FFFF00"
      padding={1}
      flexDirection="column"
      gap={1}
      bg="#1a1a2e"
    >
      <text fg="#FFFF00" bold>
        Permission Required
      </text>
      <text fg="#cccccc">
        Tool: {props.toolName}
      </text>
      <text fg="#888888" wrap="word">
        {props.description}
      </text>
      <box flexDirection="row" gap={3} paddingTop={1}>
        <text fg="#00FF00">[a] Allow</text>
        <text fg="#87CEEB">[A] Allow for session</text>
        <text fg="#FF4444">[d] Deny</text>
      </box>
    </box>
  )
}
