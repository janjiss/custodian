package tui

import "github.com/charmbracelet/lipgloss"

var (
	accentColor  = lipgloss.Color("#7C3AED")
	addedColor   = lipgloss.Color("#22C55E")
	deletedColor = lipgloss.Color("#EF4444")
	hunkColor    = lipgloss.Color("#06B6D4")
	mutedColor   = lipgloss.Color("#6B7280")
	headerBg     = lipgloss.Color("#18181B")
	selectedBg   = lipgloss.Color("#1E1B4B")

	addedBgColor   = lipgloss.Color("#0d2818")
	deletedBgColor = lipgloss.Color("#2a0d0d")
	collapsedBg    = lipgloss.Color("#1a1a2e")

	cursorBg        = lipgloss.Color("#1f2230")
	cursorAddedBg   = lipgloss.Color("#163d28")
	cursorDeletedBg = lipgloss.Color("#3d1616")

	searchMatchColor = lipgloss.Color("#FBBF24")
	matchCharStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#FBBF24")).Bold(true).Underline(true)

	threadMarkerColor = accentColor
	threadOpenColor   = accentColor
	threadDoneColor   = mutedColor
	visualBg          = lipgloss.Color("#2d2a4e")

	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FAFAFA")).
			Background(accentColor).
			Padding(0, 1)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#A1A1AA")).
			Background(headerBg).
			Padding(0, 1)

	selectedStyle = lipgloss.NewStyle().
			Background(selectedBg).
			Foreground(lipgloss.Color("#FAFAFA")).
			Bold(true)

	normalStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#D4D4D8"))

	addedKindStyle = lipgloss.NewStyle().
			Foreground(addedColor).
			Bold(true)

	modifiedKindStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#F59E0B")).
				Bold(true)

	deletedKindStyle = lipgloss.NewStyle().
				Foreground(deletedColor).
				Bold(true)

	untrackedKindStyle = lipgloss.NewStyle().
				Foreground(mutedColor)

	// Diff rendering

	diffHeaderStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FAFAFA")).
			Bold(true)

	diffHunkStyle = lipgloss.NewStyle().
			Foreground(hunkColor).
			Bold(true)

	gutterDimStyle = lipgloss.NewStyle().
			Foreground(mutedColor)

	addedGutterStyle = lipgloss.NewStyle().
				Foreground(addedColor)

	deletedGutterStyle = lipgloss.NewStyle().
				Foreground(deletedColor)

	collapsedLineStyle = lipgloss.NewStyle().
				Foreground(mutedColor).
				Background(collapsedBg).
				Italic(true)

	helpStyle = lipgloss.NewStyle().
			Foreground(mutedColor).
			Padding(0, 1)

	inputBarStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FAFAFA")).
			Background(lipgloss.Color("#2d2d3e")).
			Padding(0, 1)

	outdatedBadge = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F59E0B")).
			Bold(true)

	commentBlockBg     = lipgloss.Color("#1e1e2e")
	commentBlockBorder = lipgloss.Color("#4a4a6a")
	commentBodyColor   = lipgloss.Color("#CDD6F4")
	commentMetaColor   = lipgloss.Color("#6C7086")
)

func kindStyle(k ChangeKind) lipgloss.Style {
	switch k {
	case KindAdded:
		return addedKindStyle
	case KindModified:
		return modifiedKindStyle
	case KindDeleted:
		return deletedKindStyle
	case KindUntracked:
		return untrackedKindStyle
	default:
		return normalStyle
	}
}
