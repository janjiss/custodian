package tui

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/alecthomas/chroma/v2"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"
	"github.com/charmbracelet/lipgloss"
	"github.com/janjiss/custodian/internal/review"
)

type lineType int

const (
	lineContext lineType = iota
	lineAdded
	lineDeleted
	lineHunkHeader
	lineFileHeader
	lineCollapsed
)

type threadInfo struct {
	body      string
	count     int
	status    string
	outdated  bool
	lineStart int
	lineEnd   int
	comments  []review.Comment
}

type diffLine struct {
	kind    lineType
	raw     string
	content string
	oldNum  int
	newNum  int
	hidden  int
}

type parsedDiff struct {
	lines  []diffLine
	maxOld int
	maxNew int
}

var hunkRe = regexp.MustCompile(`^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@`)

func parseDiffOutput(raw string) *parsedDiff {
	pd := &parsedDiff{}
	var oldNum, newNum int
	var prevOldEnd int
	firstHunk := true

	for _, line := range strings.Split(raw, "\n") {
		if line == "" {
			continue
		}

		switch {
		case strings.HasPrefix(line, "diff "),
			strings.HasPrefix(line, "index "),
			strings.HasPrefix(line, "new file"),
			strings.HasPrefix(line, "deleted file"),
			strings.HasPrefix(line, "old mode"),
			strings.HasPrefix(line, "new mode"),
			strings.HasPrefix(line, "similarity"),
			strings.HasPrefix(line, "rename"),
			strings.HasPrefix(line, "--- "),
			strings.HasPrefix(line, "+++ "),
			strings.HasPrefix(line, "\\ "):
			continue

		case strings.HasPrefix(line, "@@"):
			m := hunkRe.FindStringSubmatch(line)
			if len(m) >= 3 {
				oldNum, _ = strconv.Atoi(m[1])
				newNum, _ = strconv.Atoi(m[2])

				if !firstHunk && oldNum > prevOldEnd+1 {
					pd.lines = append(pd.lines, diffLine{
						kind:   lineCollapsed,
						hidden: oldNum - prevOldEnd - 1,
					})
				}
				firstHunk = false
			}
			pd.lines = append(pd.lines, diffLine{kind: lineHunkHeader, raw: line})

		case line[0] == '+':
			pd.lines = append(pd.lines, diffLine{
				kind: lineAdded, content: line[1:], newNum: newNum,
			})
			if newNum > pd.maxNew {
				pd.maxNew = newNum
			}
			newNum++

		case line[0] == '-':
			pd.lines = append(pd.lines, diffLine{
				kind: lineDeleted, content: line[1:], oldNum: oldNum,
			})
			if oldNum > pd.maxOld {
				pd.maxOld = oldNum
			}
			oldNum++
			prevOldEnd = oldNum - 1

		default:
			content := line
			if len(line) > 0 && line[0] == ' ' {
				content = line[1:]
			}
			pd.lines = append(pd.lines, diffLine{
				kind: lineContext, content: content,
				oldNum: oldNum, newNum: newNum,
			})
			if oldNum > pd.maxOld {
				pd.maxOld = oldNum
			}
			if newNum > pd.maxNew {
				pd.maxNew = newNum
			}
			oldNum++
			newNum++
			prevOldEnd = oldNum - 1
		}
	}

	return pd
}

func renderParsedDiff(pd *parsedDiff, fileName string, width int, cursorLine int, matches map[int]bool, threads map[int]threadInfo, rangeLines map[int]bool, visStart, visEnd int) (string, []int) {
	lex := lexers.Match(fileName)
	if lex == nil {
		lex = lexers.Fallback
	}
	lex = chroma.Coalesce(lex)

	cs := styles.Get("dracula")
	if cs == nil {
		cs = styles.Fallback
	}

	nw := len(strconv.Itoa(max(pd.maxOld, pd.maxNew)))
	if nw < 3 {
		nw = 3
	}
	gutterW := nw*2 + 5

	offsets := make([]int, len(pd.lines))
	termLine := 0
	var b strings.Builder
	for i, dl := range pd.lines {
		offsets[i] = termLine
		cur := i == cursorLine
		isMatch := matches[i]
		ti, hasThread := threads[dl.newNum]
		inRange := rangeLines[dl.newNum]
		inVisual := visStart >= 0 && i >= visStart && i <= visEnd && dl.kind != lineDeleted
		switch dl.kind {
		case lineHunkHeader:
			mark := lineMarker(false, false, inVisual, cur, lineHunkHeader)
			s := diffHunkStyle
			if cur {
				s = s.Background(cursorBg)
			} else if inVisual {
				s = s.Background(visualBg)
			} else if isMatch {
				s = s.Foreground(searchMatchColor)
			}
			b.WriteString(mark)
			b.WriteString(s.Width(width - 1).MaxWidth(width - 1).Render(dl.raw))
		case lineCollapsed:
			mark := lineMarker(false, false, inVisual, cur, lineCollapsed)
			label := fmt.Sprintf(" ··· %d lines hidden ···", dl.hidden)
			s := collapsedLineStyle
			if cur {
				s = s.Background(cursorBg)
			} else if inVisual {
				s = s.Background(visualBg)
			}
			b.WriteString(mark)
			b.WriteString(s.Width(width - 1).Render(label))
		default:
			mark := lineMarker(hasThread, inRange, inVisual, cur, dl.kind)
			gutter := renderGutter(dl.oldNum, dl.newNum, dl.kind, nw, cur, isMatch)
			codeW := width - gutterW - 1
			if codeW < 20 {
				codeW = 20
			}
			visualNotCursor := inVisual && !cur
			code := highlightCode(dl.content, lex, cs, dl.kind, codeW, cur)
			b.WriteString(mark)
			if visualNotCursor {
				gutter = renderGutter(dl.oldNum, dl.newNum, dl.kind, nw, false, isMatch)
				code = highlightCode(dl.content, lex, cs, dl.kind, codeW, false)
				b.WriteString(lipgloss.NewStyle().Background(visualBg).Render(gutter))
				b.WriteString(lipgloss.NewStyle().Background(visualBg).Render(code))
			} else {
				b.WriteString(gutter)
				b.WriteString(code)
			}
		}
		b.WriteString("\n")
		termLine++

		if hasThread && dl.kind != lineHunkHeader && dl.kind != lineCollapsed {
			b.WriteString(renderCommentBlock(ti, width))
			termLine += commentBlockHeight(ti, width)
		}
	}
	return b.String(), offsets
}

func threadMark(hasThread bool, isCursor bool, lt lineType) string {
	ch := " "
	if hasThread {
		ch = "•"
	}
	if isCursor {
		bg, _ := lineBg(lt, true)
		s := lipgloss.NewStyle().Background(bg)
		if hasThread {
			s = s.Foreground(threadMarkerColor)
		}
		return s.Render(ch)
	}
	if hasThread {
		return lipgloss.NewStyle().Foreground(threadMarkerColor).Render(ch)
	}
	return ch
}

// lineMarker renders the first column: visual selection bar > thread range bar > thread dot > blank.
func lineMarker(hasThread bool, inRange bool, inVisual bool, isCursor bool, lt lineType) string {
	if inVisual {
		if isCursor {
			bg, _ := lineBg(lt, true)
			return lipgloss.NewStyle().Foreground(accentColor).Background(bg).Render("▎")
		}
		return lipgloss.NewStyle().Foreground(accentColor).Background(visualBg).Render("▎")
	}
	if inRange && !hasThread {
		if isCursor {
			bg, _ := lineBg(lt, true)
			return lipgloss.NewStyle().Foreground(threadMarkerColor).Background(bg).Render("┃")
		}
		return lipgloss.NewStyle().Foreground(threadMarkerColor).Render("┃")
	}
	return threadMark(hasThread, isCursor, lt)
}

func renderGutter(oldN, newN int, lt lineType, w int, isCursor bool, isSearchMatch bool) string {
	o := strings.Repeat(" ", w)
	n := strings.Repeat(" ", w)
	if oldN > 0 {
		o = fmt.Sprintf("%*d", w, oldN)
	}
	if newN > 0 {
		n = fmt.Sprintf("%*d", w, newN)
	}

	prefix := " "
	switch lt {
	case lineAdded:
		prefix = "+"
	case lineDeleted:
		prefix = "-"
	}

	raw := fmt.Sprintf("%s %s │%s", o, n, prefix)

	if isCursor {
		bg, _ := lineBg(lt, true)
		fg := mutedColor
		switch lt {
		case lineAdded:
			fg = addedColor
		case lineDeleted:
			fg = deletedColor
		}
		return lipgloss.NewStyle().Foreground(fg).Background(bg).Render(raw)
	}

	if isSearchMatch {
		return lipgloss.NewStyle().Foreground(searchMatchColor).Render(raw)
	}

	switch lt {
	case lineAdded:
		return addedGutterStyle.Render(raw)
	case lineDeleted:
		return deletedGutterStyle.Render(raw)
	default:
		return gutterDimStyle.Render(raw)
	}
}

func lineBg(lt lineType, isCursor bool) (lipgloss.Color, bool) {
	if isCursor {
		switch lt {
		case lineAdded:
			return cursorAddedBg, true
		case lineDeleted:
			return cursorDeletedBg, true
		default:
			return cursorBg, true
		}
	}
	switch lt {
	case lineAdded:
		return addedBgColor, true
	case lineDeleted:
		return deletedBgColor, true
	default:
		return "", false
	}
}

func highlightCode(content string, lex chroma.Lexer, cs *chroma.Style, lt lineType, codeWidth int, isCursor bool) string {
	bg, hasBg := lineBg(lt, isCursor)

	if content == "" {
		if hasBg {
			return lipgloss.NewStyle().Background(bg).Width(codeWidth).Render("")
		}
		return ""
	}

	iter, err := lex.Tokenise(nil, content)
	if err != nil {
		if hasBg {
			return lipgloss.NewStyle().Background(bg).Render(content)
		}
		return content
	}

	var result strings.Builder
	for _, tok := range iter.Tokens() {
		text := strings.TrimSuffix(tok.Value, "\n")
		if text == "" {
			continue
		}

		s := lipgloss.NewStyle()
		entry := cs.Get(tok.Type)
		if entry.Colour.IsSet() {
			s = s.Foreground(lipgloss.Color(entry.Colour.String()))
		}
		if hasBg {
			s = s.Background(bg)
		}
		result.WriteString(s.Render(text))
	}

	rendered := result.String()
	if hasBg && codeWidth > 0 {
		vis := lipgloss.Width(rendered)
		if vis < codeWidth {
			rendered += lipgloss.NewStyle().Background(bg).Render(strings.Repeat(" ", codeWidth-vis))
		}
	}
	return rendered
}

func changedNewLines(pd *parsedDiff) map[int]bool {
	m := make(map[int]bool)
	if pd == nil {
		return m
	}
	for _, dl := range pd.lines {
		if dl.kind == lineAdded && dl.newNum > 0 {
			m[dl.newNum] = true
		}
	}
	return m
}

func renderFullFile(content string, fileName string, pd *parsedDiff, width int, cursorLine int, matches map[int]bool, threads map[int]threadInfo, rangeLines map[int]bool, visStart, visEnd int) (string, []int) {
	lines := strings.Split(content, "\n")

	lex := lexers.Match(fileName)
	if lex == nil {
		lex = lexers.Fallback
	}
	lex = chroma.Coalesce(lex)

	cs := styles.Get("dracula")
	if cs == nil {
		cs = styles.Fallback
	}

	changed := changedNewLines(pd)

	nw := len(strconv.Itoa(len(lines)))
	if nw < 3 {
		nw = 3
	}
	gutterW := nw + 4

	offsets := make([]int, len(lines))
	termLine := 0
	var b strings.Builder
	for i, line := range lines {
		offsets[i] = termLine
		lineNum := i + 1
		isChanged := changed[lineNum]
		cur := i == cursorLine
		isMatch := matches[i]
		ti, hasThread := threads[lineNum]
		inRange := rangeLines[lineNum]
		inVisual := visStart >= 0 && i >= visStart && i <= visEnd

		lt := lineContext
		if isChanged {
			lt = lineAdded
		}

		mark := lineMarker(hasThread, inRange, inVisual, cur, lt)

		numStr := fmt.Sprintf("%*d │", nw, lineNum)
		suffix := " "
		if isChanged {
			suffix = "+"
		}
		gutterText := numStr + suffix

		visualNotCursor := inVisual && !cur

		if isChanged {
			bg, _ := lineBg(lineAdded, cur)
			if visualNotCursor {
				bg = visualBg
			}
			b.WriteString(mark)
			b.WriteString(lipgloss.NewStyle().Foreground(addedColor).Background(bg).Render(gutterText))
		} else if cur {
			b.WriteString(mark)
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Background(cursorBg).Render(gutterText))
		} else if visualNotCursor {
			b.WriteString(mark)
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Background(visualBg).Render(gutterText))
		} else if isMatch {
			b.WriteString(mark)
			b.WriteString(lipgloss.NewStyle().Foreground(searchMatchColor).Render(gutterText))
		} else {
			b.WriteString(mark)
			b.WriteString(gutterDimStyle.Render(gutterText))
		}

		codeW := width - gutterW - 1
		if codeW < 20 {
			codeW = 20
		}
		if visualNotCursor {
			code := highlightCode(line, lex, cs, lt, codeW, false)
			b.WriteString(lipgloss.NewStyle().Background(visualBg).Render(code))
		} else {
			b.WriteString(highlightCode(line, lex, cs, lt, codeW, cur))
		}
		b.WriteString("\n")
		termLine++

		if hasThread {
			b.WriteString(renderCommentBlock(ti, width))
			termLine += commentBlockHeight(ti, width)
		}
	}

	return b.String(), offsets
}

func renderCommentBlock(ti threadInfo, width int) string {
	innerW := width - 4
	if innerW < 20 {
		innerW = 20
	}

	border := lipgloss.NewStyle().Foreground(commentBlockBorder)
	bg := lipgloss.NewStyle().Background(commentBlockBg)

	rangeLabel := ""
	if ti.lineEnd > 0 && ti.lineEnd != ti.lineStart {
		rangeLabel = fmt.Sprintf(" ln %d-%d ", ti.lineStart, ti.lineEnd)
	}

	statusIcon := "○"
	statusColor := threadOpenColor
	if ti.status == "resolved" {
		statusIcon = "✓"
		statusColor = threadDoneColor
	}
	meta := fmt.Sprintf("%s %s", statusIcon, ti.status)
	if ti.outdated {
		meta += " · outdated"
	}

	topBar := border.Render("  ╭─ 💬" + rangeLabel + " " + strings.Repeat("─", max(0, innerW-7-len(rangeLabel))) + "╮")

	var lines []string
	lines = append(lines, topBar)

	comments := ti.comments
	if len(comments) == 0 && ti.body != "" {
		comments = []review.Comment{{Author: review.AuthorHuman, Body: ti.body}}
	}

	for i, c := range comments {
		author := string(c.Author)
		prefix := "  │"
		if i > 0 {
			sep := border.Render("  ├" + strings.Repeat("┈", innerW) + "┤")
			lines = append(lines, sep)
		}
		authorLine := border.Render(prefix) +
			bg.Foreground(commentMetaColor).Width(innerW).MaxWidth(innerW).Render(" "+author) +
			border.Render("│")
		lines = append(lines, authorLine)

		bodyW := innerW - 1
		if bodyW < 1 {
			bodyW = 1
		}
		wrapped := wordWrap(c.Body, bodyW)
		if len(wrapped) == 0 {
			wrapped = []string{""}
		}
		for _, wl := range wrapped {
			bodyLine := border.Render(prefix) +
				bg.Foreground(commentBodyColor).Width(innerW).MaxWidth(innerW).Render(" "+wl) +
				border.Render("│")
			lines = append(lines, bodyLine)
		}
	}

	metaLine := border.Render("  │") +
		bg.Foreground(statusColor).Width(innerW).MaxWidth(innerW).Render(" "+meta) +
		border.Render("│")
	lines = append(lines, metaLine)

	bottomBar := border.Render("  ╰" + strings.Repeat("─", max(0, innerW)) + "╯")
	lines = append(lines, bottomBar)

	return strings.Join(lines, "\n") + "\n"
}

func commentBlockHeight(ti threadInfo, width int) int {
	n := len(ti.comments)
	if n == 0 && ti.body != "" {
		n = 1
	}
	if n == 0 {
		return 3
	}

	innerW := width - 4
	if innerW < 20 {
		innerW = 20
	}
	bodyW := innerW - 1
	if bodyW < 1 {
		bodyW = 1
	}

	comments := ti.comments
	if len(comments) == 0 && ti.body != "" {
		comments = []review.Comment{{Body: ti.body}}
	}

	lines := 0
	for i, c := range comments {
		if i > 0 {
			lines++ // separator between comments
		}
		lines++ // author line
		wrapped := wordWrap(c.Body, bodyW)
		if len(wrapped) == 0 {
			lines++
		} else {
			lines += len(wrapped)
		}
	}

	// top + comment lines + meta + bottom
	return 1 + lines + 1 + 1
}
