package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/janjiss/custodian/internal/review"
)

func (m Model) renderThreadListContent(rw, h int) string {
	if len(m.threads) == 0 {
		line := normalStyle.Width(rw).MaxWidth(rw).Render("  No threads for this file. Press c on a line to add one.")
		lines := []string{line}
		for len(lines) < h {
			lines = append(lines, strings.Repeat(" ", rw))
		}
		return strings.Join(lines[:h], "\n")
	}

	var lines []string
	for i, t := range m.threads {
		statusIcon := "●"
		statusColor := threadOpenColor
		statusLabel := "open"
		if t.Status == review.ThreadResolved {
			statusIcon = "○"
			statusColor = threadDoneColor
			statusLabel = "done"
		}
		icon := lipgloss.NewStyle().Foreground(statusColor).Bold(true).Render(statusIcon)

		lineInfo := fmt.Sprintf("ln %d", t.CurrentLine)
		if t.IsOutdated {
			lineInfo += " " + outdatedBadge.Render("outdated")
		}

		preview := t.FirstComment
		maxPreview := rw - 30
		if maxPreview < 10 {
			maxPreview = 10
		}
		if len(preview) > maxPreview {
			preview = preview[:maxPreview] + "…"
		}

		entry := fmt.Sprintf("  %s %-4s  %-10s  %s", icon, statusLabel, lineInfo, preview)

		if i == m.threadCursor {
			lines = append(lines, selectedStyle.Width(rw).MaxWidth(rw).Render(entry))
		} else {
			lines = append(lines, normalStyle.Width(rw).MaxWidth(rw).Render(entry))
		}
	}

	for len(lines) < h {
		lines = append(lines, strings.Repeat(" ", rw))
	}
	if len(lines) > h {
		lines = lines[:h]
	}
	return strings.Join(lines, "\n")
}

func (m Model) renderThreadDetailContent(rw int) string {
	if m.threadDetail == nil {
		return ""
	}
	t := m.threadDetail

	var b strings.Builder

	statusLabel := lipgloss.NewStyle().Foreground(threadOpenColor).Bold(true).Render("open")
	if t.Status == review.ThreadResolved {
		statusLabel = lipgloss.NewStyle().Foreground(threadDoneColor).Render("resolved")
	}

	header := fmt.Sprintf("  %s:%d  [%s]", t.FilePath, t.CurrentLine, statusLabel)
	if t.IsOutdated {
		header += "  " + outdatedBadge.Render("[outdated]")
	}
	b.WriteString(lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FAFAFA")).Width(rw).Render(header))
	b.WriteString("\n")

	sep := lipgloss.NewStyle().Foreground(mutedColor).Render(strings.Repeat("─", rw))
	b.WriteString(sep)
	b.WriteString("\n")

	if t.AnchorContent != "" {
		anchorLabel := lipgloss.NewStyle().Foreground(mutedColor).Italic(true).Render("  Anchor:")
		b.WriteString(anchorLabel)
		b.WriteString("\n")
		for _, line := range strings.Split(t.AnchorContent, "\n") {
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#A1A1AA")).Render("  │ "+line))
			b.WriteString("\n")
		}
		b.WriteString(sep)
		b.WriteString("\n")
	}

	for _, c := range m.threadComments {
		authorColor := lipgloss.Color("#FAFAFA")
		authorLabel := "human"
		if c.Author == review.AuthorModel {
			authorColor = lipgloss.Color("#06B6D4")
			authorLabel = "model"
		}
		ts := c.CreatedAt.Format("Jan 02 15:04")
		meta := fmt.Sprintf("  %s  %s",
			lipgloss.NewStyle().Foreground(authorColor).Bold(true).Render(authorLabel),
			lipgloss.NewStyle().Foreground(mutedColor).Render(ts),
		)
		b.WriteString(meta)
		b.WriteString("\n")

		for _, line := range strings.Split(c.Body, "\n") {
			b.WriteString(normalStyle.Render("  "+line))
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}

	return b.String()
}
