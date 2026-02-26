import type { FileDiff } from "../../core/diff"

interface ReviewToolbarProps {
  file: FileDiff | null
  onAccept: () => void
  onReject: () => void
  onToggleStaged: () => void
}

export const ReviewToolbar = (props: ReviewToolbarProps) => {
  return (
    <box flexDirection="row" width="100%" height={1} gap={2} bg="#1a1a2e">
      <text fg="#888888">
        {props.file ? props.file.newPath : "No file"}
      </text>
      <text fg="#00FF00">[a]ccept</text>
      <text fg="#FF4444">[r]eject</text>
      <text fg="#FFFF00">[s]tage</text>
    </box>
  )
}
