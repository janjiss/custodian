package review

import "strings"

const relocateMaxDelta = 50

// RelocateThreads updates CurrentLine and IsOutdated for each thread
// by searching for AnchorContent in the current file lines.
func RelocateThreads(threads []Thread, fileLines []string) []Thread {
	for i := range threads {
		threads[i] = relocateThread(threads[i], fileLines)
	}
	return threads
}

func relocateThread(t Thread, lines []string) Thread {
	if t.CurrentLine <= 0 || len(lines) == 0 {
		return t
	}

	anchor := t.AnchorContent
	origIdx := t.CurrentLine - 1
	anchorLines := strings.Split(anchor, "\n")
	rangeLen := 0
	if t.LineEnd > t.CurrentLine {
		rangeLen = t.LineEnd - t.CurrentLine
	}

	if anchorMatchesAt(lines, origIdx, anchorLines) {
		t.IsOutdated = false
		return t
	}

	for delta := 1; delta <= relocateMaxDelta; delta++ {
		if up := origIdx - delta; up >= 0 && anchorMatchesAt(lines, up, anchorLines) {
			t.CurrentLine = up + 1
			if rangeLen > 0 {
				t.LineEnd = t.CurrentLine + rangeLen
			}
			t.IsOutdated = false
			return t
		}
		if dn := origIdx + delta; dn >= 0 && anchorMatchesAt(lines, dn, anchorLines) {
			t.CurrentLine = dn + 1
			if rangeLen > 0 {
				t.LineEnd = t.CurrentLine + rangeLen
			}
			t.IsOutdated = false
			return t
		}
	}

	if t.ContextBefore != "" || t.ContextAfter != "" {
		for j := 0; j < len(lines); j++ {
			if matchesContext(lines, j, t.ContextBefore, t.ContextAfter) {
				t.CurrentLine = j + 1
				if rangeLen > 0 {
					t.LineEnd = t.CurrentLine + rangeLen
				}
				t.IsOutdated = true
				return t
			}
		}
	}

	t.IsOutdated = true
	return t
}

func anchorMatchesAt(lines []string, idx int, anchorLines []string) bool {
	if idx < 0 || idx+len(anchorLines) > len(lines) {
		return false
	}
	for i, al := range anchorLines {
		if lines[idx+i] != al {
			return false
		}
	}
	return true
}

func matchesContext(lines []string, idx int, before, after string) bool {
	if before != "" {
		bl := strings.Split(before, "\n")
		for i, b := range bl {
			pos := idx - len(bl) + i
			if pos < 0 || pos >= len(lines) || lines[pos] != b {
				return false
			}
		}
	}
	if after != "" {
		al := strings.Split(after, "\n")
		for i, a := range al {
			pos := idx + 1 + i
			if pos >= len(lines) || lines[pos] != a {
				return false
			}
		}
	}
	return before != "" || after != ""
}

// ExtractContext captures the anchor line content and surrounding context.
func ExtractContext(fileContent string, lineNum int) (anchor, before, after string) {
	lines := strings.Split(fileContent, "\n")
	idx := lineNum - 1
	if idx < 0 || idx >= len(lines) {
		return "", "", ""
	}
	anchor = lines[idx]

	startBefore := idx - 3
	if startBefore < 0 {
		startBefore = 0
	}
	before = strings.Join(lines[startBefore:idx], "\n")

	endAfter := idx + 4
	if endAfter > len(lines) {
		endAfter = len(lines)
	}
	after = strings.Join(lines[idx+1:endAfter], "\n")
	return
}

// ExtractRangeAnchor captures anchor content for a range of lines.
func ExtractRangeAnchor(fileContent string, startLine, endLine int) string {
	lines := strings.Split(fileContent, "\n")
	si := startLine - 1
	ei := endLine
	if si < 0 {
		si = 0
	}
	if ei > len(lines) {
		ei = len(lines)
	}
	return strings.Join(lines[si:ei], "\n")
}
