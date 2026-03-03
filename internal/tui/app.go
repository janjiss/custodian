package tui

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/janjiss/custodian/internal/git"
	logpkg "github.com/janjiss/custodian/internal/log"
	"github.com/janjiss/custodian/internal/review"
	"github.com/janjiss/custodian/internal/store"
	"github.com/sahilm/fuzzy"
)

type ChangeKind = git.ChangeKind

const (
	KindModified  = git.Modified
	KindAdded     = git.Added
	KindDeleted   = git.Deleted
	KindRenamed   = git.Renamed
	KindCopied    = git.Copied
	KindUntracked = git.Untracked
)

type pane int

const (
	paneFiles pane = iota
	paneDiff
)

const scrollMargin = 3

type fileSource []git.FileChange

func (s fileSource) String(i int) string { return s[i].Path }
func (s fileSource) Len() int            { return len(s) }

type Model struct {
	repo  *git.Repo
	store *store.Store

	changes []git.FileChange
	cursor  int
	focus   pane

	// File filter
	listOffset   int
	sidebarW     int
	filterActive bool
	filterQuery  string
	filtered     fuzzy.Matches

	// Diff viewer
	diffRaw      string
	currentFile  string
	parsed       *parsedDiff
	expanded     bool
	showFullFile bool
	fileContent  string
	diffCursor   int
	lineOffsets  []int
	viewport     viewport.Model

	// Diff search
	searchActive  bool
	searchQuery   string
	searchMatches []int
	searchIdx     int

	// Session & threads
	session     *review.ReviewSession
	threads     []review.Thread
	threadWg    int // monotonic counter for stale-thread detection
	allComments map[string][]review.Comment

	// Thread panel
	showThreads      bool
	threadCursor     int
	threadDetail     *review.Thread
	threadComments   []review.Comment
	inlineDetailOpen bool

	// Comment creation
	commentActive  bool
	commentInput   string
	commentLine    int
	commentLineEnd int
	visualMode     bool
	visualStart    int

	// Thread reply
	replyActive       bool
	replyInput        string
	inlineReplyThread *review.Thread

	// Delete confirmation
	confirmDelete *review.Thread

	// Goto line
	gotoActive bool
	gotoInput  string

	width  int
	height int
	ready  bool

	err error
}

// --- Messages ---

type changesMsg struct {
	changes []git.FileChange
	err     error
}

type diffMsg struct {
	content  string
	fileName string
	err      error
}

type fileContentMsg struct {
	content string
	err     error
}

type sessionMsg struct {
	session *review.ReviewSession
	err     error
}

type threadsMsg struct {
	threads  []review.Thread
	comments map[string][]review.Comment
	filePath string
	seq      int
	err      error
}

type commentCreatedMsg struct{ err error }
type threadStatusMsg struct{ err error }
type threadDeletedMsg struct{ err error }
type replyCreatedMsg struct{ err error }
type tickMsg struct{}
type softChangesMsg struct {
	changes []git.FileChange
	err     error
}

const autoRefreshInterval = 3 * time.Second

func tickCmd() tea.Cmd {
	return tea.Tick(autoRefreshInterval, func(time.Time) tea.Msg {
		return tickMsg{}
	})
}

// --- Constructor & Init ---

func New(repo *git.Repo, st *store.Store) Model {
	return Model{repo: repo, store: st}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(m.loadChanges, m.loadOrCreateSession, tickCmd())
}

// --- Commands ---

func (m Model) loadChanges() tea.Msg {
	changes, err := m.repo.Changes()
	return changesMsg{changes: changes, err: err}
}

func (m Model) softLoadChanges() tea.Msg {
	changes, err := m.repo.Changes()
	return softChangesMsg{changes: changes, err: err}
}

func (m Model) loadOrCreateSession() tea.Msg {
	if m.store == nil {
		return sessionMsg{err: fmt.Errorf("store not initialized")}
	}
	sess, err := m.store.ActiveSession()
	if err != nil {
		return sessionMsg{err: err}
	}
	if sess == nil {
		sess, err = m.store.CreateSession(m.repo.Root)
		if err != nil {
			return sessionMsg{err: err}
		}
	}
	return sessionMsg{session: sess}
}

func (m Model) selectedChange() (git.FileChange, bool) {
	if m.filtered != nil {
		if m.cursor >= 0 && m.cursor < len(m.filtered) {
			return m.changes[m.filtered[m.cursor].Index], true
		}
		return git.FileChange{}, false
	}
	if m.cursor >= 0 && m.cursor < len(m.changes) {
		return m.changes[m.cursor], true
	}
	return git.FileChange{}, false
}

func (m Model) visibleCount() int {
	if m.filtered != nil {
		return len(m.filtered)
	}
	return len(m.changes)
}

func (m Model) visibleChanges() []git.FileChange {
	if m.filtered != nil {
		out := make([]git.FileChange, len(m.filtered))
		for i, f := range m.filtered {
			out[i] = m.changes[f.Index]
		}
		return out
	}
	return m.changes
}

func (m Model) loadDiffForCurrent() tea.Cmd {
	fc, ok := m.selectedChange()
	if !ok {
		return nil
	}
	ctx := m.diffContext()
	return func() tea.Msg {
		content, err := m.repo.Diff(fc, ctx)
		return diffMsg{content: content, fileName: fc.Path, err: err}
	}
}

func (m Model) loadFileContent() tea.Cmd {
	path := m.currentFile
	repo := m.repo
	return func() tea.Msg {
		content, err := repo.ReadFile(path)
		return fileContentMsg{content: content, err: err}
	}
}

func (m Model) loadThreadsForFile() tea.Cmd {
	if m.session == nil || m.currentFile == "" || m.store == nil {
		return nil
	}
	st := m.store
	sessID := m.session.ID
	fp := m.currentFile
	repo := m.repo
	seq := m.threadWg
	return func() tea.Msg {
		threads, err := st.ListThreads(sessID, fp)
		if err != nil {
			return threadsMsg{err: err, seq: seq}
		}
		if len(threads) > 0 {
			content, readErr := repo.ReadFile(fp)
			if readErr == nil {
				lines := strings.Split(content, "\n")
				threads = review.RelocateThreads(threads, lines)
				for _, t := range threads {
					st.UpdateThreadLine(t.ID, t.CurrentLine, t.IsOutdated)
				}
			}
		}
		var commentMap map[string][]review.Comment
		if len(threads) > 0 {
			ids := make([]string, len(threads))
			for i, t := range threads {
				ids[i] = t.ID
			}
			commentMap, _ = st.ListCommentsForThreads(ids)
		}
		return threadsMsg{threads: threads, comments: commentMap, filePath: fp, seq: seq}
	}
}

func (m Model) createComment() tea.Cmd {
	st := m.store
	sess := m.session
	fp := m.currentFile
	repo := m.repo
	body := m.commentInput
	startLine := m.commentLine
	endLine := m.commentLineEnd
	return func() tea.Msg {
		content, err := repo.ReadFile(fp)
		if err != nil {
			return commentCreatedMsg{err: err}
		}
		anchor, before, after := review.ExtractContext(content, startLine)
		if endLine > startLine {
			anchor = review.ExtractRangeAnchor(content, startLine, endLine)
		}
		t := &review.Thread{
			SessionID:     sess.ID,
			FilePath:      fp,
			Side:          "new",
			OriginalLine:  startLine,
			LineEnd:       endLine,
			CurrentLine:   startLine,
			AnchorContent: anchor,
			ContextBefore: before,
			ContextAfter:  after,
			Status:        review.ThreadOpen,
		}
		if err := st.CreateThread(t); err != nil {
			return commentCreatedMsg{err: err}
		}
		c := &review.Comment{
			ThreadID: t.ID,
			Author:   review.AuthorHuman,
			Body:     body,
		}
		if err := st.AddComment(c); err != nil {
			return commentCreatedMsg{err: err}
		}
		logpkg.Debug("created thread %s with comment on %s:%d", t.ID, fp, startLine)
		return commentCreatedMsg{}
	}
}

func (m Model) addReply() tea.Cmd {
	st := m.store
	threadID := m.threadDetail.ID
	body := m.replyInput
	return func() tea.Msg {
		c := &review.Comment{
			ThreadID: threadID,
			Author:   review.AuthorHuman,
			Body:     body,
		}
		if err := st.AddComment(c); err != nil {
			return replyCreatedMsg{err: err}
		}
		logpkg.Debug("added reply to thread %s", threadID)
		return replyCreatedMsg{}
	}
}

func (m Model) toggleThreadStatus() tea.Cmd {
	if m.threadCursor >= len(m.threads) {
		return nil
	}
	st := m.store
	t := m.threads[m.threadCursor]
	newStatus := review.ThreadResolved
	if t.Status == review.ThreadResolved {
		newStatus = review.ThreadOpen
	}
	return func() tea.Msg {
		err := st.UpdateThreadStatus(t.ID, newStatus)
		return threadStatusMsg{err: err}
	}
}

func (m Model) toggleDetailThreadStatus() tea.Cmd {
	if m.threadDetail == nil {
		return nil
	}
	st := m.store
	t := m.threadDetail
	newStatus := review.ThreadResolved
	if t.Status == review.ThreadResolved {
		newStatus = review.ThreadOpen
	}
	return func() tea.Msg {
		err := st.UpdateThreadStatus(t.ID, newStatus)
		return threadStatusMsg{err: err}
	}
}

func (m Model) toggleThread(t *review.Thread) tea.Cmd {
	if t == nil {
		return nil
	}
	st := m.store
	id := t.ID
	newStatus := review.ThreadResolved
	if t.Status == review.ThreadResolved {
		newStatus = review.ThreadOpen
	}
	return func() tea.Msg {
		err := st.UpdateThreadStatus(id, newStatus)
		return threadStatusMsg{err: err}
	}
}

// --- Helpers ---

func (m Model) diffContext() int {
	if m.expanded {
		return 99999
	}
	return 3
}

func (m Model) rightPaneWidth() int {
	rw := m.width - m.sidebarW - 1
	if rw < 10 {
		return 10
	}
	return rw
}

func (m Model) viewportHeight() int {
	vh := m.height - 3
	if vh < 1 {
		return 1
	}
	return vh
}

func (m Model) totalDiffLines() int {
	if m.showFullFile && m.fileContent != "" {
		return len(strings.Split(m.fileContent, "\n"))
	}
	if m.parsed != nil {
		return len(m.parsed.lines)
	}
	return 0
}

func (m Model) searchMatchSet() map[int]bool {
	if len(m.searchMatches) == 0 {
		return nil
	}
	set := make(map[int]bool, len(m.searchMatches))
	for _, idx := range m.searchMatches {
		set[idx] = true
	}
	return set
}

func (m Model) threadInfoMap() (map[int]threadInfo, map[int]bool) {
	if len(m.threads) == 0 {
		return nil, nil
	}
	tm := make(map[int]threadInfo)
	rangeLines := make(map[int]bool)
	for _, t := range m.threads {
		if t.CurrentLine > 0 {
			var comments []review.Comment
			if m.allComments != nil {
				comments = m.allComments[t.ID]
			}
			tm[t.CurrentLine] = threadInfo{
				body:      t.FirstComment,
				count:     t.CommentCount,
				status:    string(t.Status),
				outdated:  t.IsOutdated,
				lineStart: t.CurrentLine,
				lineEnd:   t.LineEnd,
				comments:  comments,
			}
			if t.LineEnd > 0 && t.LineEnd != t.CurrentLine {
				for ln := t.CurrentLine; ln <= t.LineEnd; ln++ {
					rangeLines[ln] = true
				}
			}
		}
	}
	return tm, rangeLines
}

func (m Model) renderViewport() (string, []int) {
	rw := m.rightPaneWidth()
	ms := m.searchMatchSet()
	tm, rl := m.threadInfoMap()
	vs, ve := -1, -1
	if m.visualMode {
		vs = min(m.visualStart, m.diffCursor)
		ve = max(m.visualStart, m.diffCursor)
	}
	if m.showFullFile && m.fileContent != "" {
		return renderFullFile(m.fileContent, m.currentFile, m.parsed, rw, m.diffCursor, ms, tm, rl, vs, ve)
	}
	if m.parsed != nil {
		return renderParsedDiff(m.parsed, m.currentFile, rw, m.diffCursor, ms, tm, rl, vs, ve)
	}
	return "", nil
}

func (m Model) withViewport() Model {
	content, offsets := m.renderViewport()
	m.lineOffsets = offsets
	m.viewport.SetContent(content)
	return m
}

func (m Model) moveCursor(delta int) Model {
	total := m.totalDiffLines()
	if total == 0 {
		return m
	}
	m.diffCursor += delta
	if m.diffCursor < 0 {
		m.diffCursor = 0
	}
	if m.diffCursor >= total {
		m.diffCursor = total - 1
	}

	if !m.showFullFile && m.parsed != nil && delta != 0 {
		dir := 1
		if delta < 0 {
			dir = -1
		}
		for m.diffCursor > 0 && m.diffCursor < total-1 {
			dl := m.parsed.lines[m.diffCursor]
			if dl.kind != lineDeleted {
				break
			}
			m.diffCursor += dir
		}
	}
	content, offsets := m.renderViewport()
	m.lineOffsets = offsets
	m.viewport.SetContent(content)

	termLine := m.diffCursor
	if m.lineOffsets != nil && m.diffCursor < len(m.lineOffsets) {
		termLine = m.lineOffsets[m.diffCursor]
	}
	margin := scrollMargin
	if m.viewport.Height <= margin*2 {
		margin = 0
	}
	if termLine < m.viewport.YOffset+margin {
		m.viewport.YOffset = max(0, termLine-margin)
	}
	if termLine >= m.viewport.YOffset+m.viewport.Height-margin {
		m.viewport.YOffset = termLine - m.viewport.Height + margin + 1
	}

	totalTermLines := m.totalTermLines()
	maxY := max(0, totalTermLines-m.viewport.Height)
	if m.viewport.YOffset > maxY {
		m.viewport.YOffset = maxY
	}
	return m
}

func (m Model) isBlockBoundary(idx int) bool {
	if m.showFullFile && m.fileContent != "" {
		lines := strings.Split(m.fileContent, "\n")
		if idx < 0 || idx >= len(lines) {
			return true
		}
		return strings.TrimSpace(lines[idx]) == ""
	}
	if m.parsed != nil {
		if idx < 0 || idx >= len(m.parsed.lines) {
			return true
		}
		dl := m.parsed.lines[idx]
		switch dl.kind {
		case lineHunkHeader, lineCollapsed:
			return true
		default:
			return strings.TrimSpace(dl.content) == ""
		}
	}
	return false
}

func (m Model) jumpBlock(dir int) Model {
	total := m.totalDiffLines()
	if total == 0 {
		return m
	}
	cur := m.diffCursor

	// Skip current block boundary lines
	for cur+dir >= 0 && cur+dir < total && m.isBlockBoundary(cur) {
		cur += dir
	}
	// Move through non-boundary lines
	for cur+dir >= 0 && cur+dir < total && !m.isBlockBoundary(cur+dir) {
		cur += dir
	}
	// Land on the boundary
	if cur+dir >= 0 && cur+dir < total {
		cur += dir
	}

	m.diffCursor = cur
	return m.moveCursor(0)
}

func (m Model) totalTermLines() int {
	total := m.totalDiffLines()
	if m.lineOffsets == nil || len(m.lineOffsets) == 0 {
		return total
	}
	last := m.lineOffsets[len(m.lineOffsets)-1]
	tm, _ := m.threadInfoMap()
	if m.parsed != nil && !m.showFullFile {
		if len(m.parsed.lines) > 0 {
			dl := m.parsed.lines[len(m.parsed.lines)-1]
			if _, ok := tm[dl.newNum]; ok && dl.kind != lineHunkHeader && dl.kind != lineCollapsed {
				return last + 1 + commentBlockHeight(threadInfo{})
			}
		}
	} else if m.showFullFile && m.fileContent != "" {
		lineNum := len(m.lineOffsets)
		if _, ok := tm[lineNum]; ok {
			return last + 1 + commentBlockHeight(threadInfo{})
		}
	}
	return last + 1
}

func (m Model) refilter() Model {
	if m.filterQuery == "" {
		m.filtered = nil
	} else {
		m.filtered = fuzzy.FindFrom(m.filterQuery, fileSource(m.changes))
	}
	m.cursor = 0
	m.listOffset = 0
	return m
}

func (m Model) computeSearchMatches() []int {
	if m.searchQuery == "" {
		return nil
	}
	query := strings.ToLower(m.searchQuery)
	var out []int
	if m.showFullFile && m.fileContent != "" {
		for i, line := range strings.Split(m.fileContent, "\n") {
			if strings.Contains(strings.ToLower(line), query) {
				out = append(out, i)
			}
		}
	} else if m.parsed != nil {
		for i, dl := range m.parsed.lines {
			text := dl.content
			if text == "" {
				text = dl.raw
			}
			if strings.Contains(strings.ToLower(text), query) {
				out = append(out, i)
			}
		}
	}
	return out
}

func (m Model) threadAtCursor() *review.Thread {
	ln, ok := m.cursorToFileLine()
	if !ok {
		return nil
	}
	for i := range m.threads {
		t := &m.threads[i]
		if t.CurrentLine == ln || (t.LineEnd > 0 && ln >= t.CurrentLine && ln <= t.LineEnd) {
			return t
		}
	}
	return nil
}

func (m Model) cursorOnThread() bool {
	return m.threadAtCursor() != nil
}

func (m Model) cursorToFileLine() (lineNum int, ok bool) {
	if m.showFullFile {
		return m.diffCursor + 1, true
	}
	if m.parsed == nil || m.diffCursor >= len(m.parsed.lines) {
		return 0, false
	}
	dl := m.parsed.lines[m.diffCursor]
	switch dl.kind {
	case lineAdded, lineContext:
		if dl.newNum > 0 {
			return dl.newNum, true
		}
	}
	return 0, false
}

func (m Model) visualRange() (startLine, endLine int, ok bool) {
	lo := min(m.visualStart, m.diffCursor)
	hi := max(m.visualStart, m.diffCursor)
	if m.showFullFile {
		return lo + 1, hi + 1, true
	}
	if m.parsed == nil {
		return 0, 0, false
	}
	minLine, maxLine := 0, 0
	for i := lo; i <= hi && i < len(m.parsed.lines); i++ {
		dl := m.parsed.lines[i]
		if dl.newNum > 0 {
			if minLine == 0 || dl.newNum < minLine {
				minLine = dl.newNum
			}
			if dl.newNum > maxLine {
				maxLine = dl.newNum
			}
		}
	}
	if minLine == 0 {
		return 0, 0, false
	}
	return minLine, maxLine, true
}

func (m Model) calcSidebarWidth() int {
	if m.width == 0 {
		return 30
	}
	w := m.width * 3 / 10
	if w < 20 {
		w = 20
	}
	if w > 50 {
		w = 50
	}
	if w >= m.width-20 {
		w = m.width / 2
	}
	return w
}

// --- Update ---

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.sidebarW = m.calcSidebarWidth()
		m.ready = true
		m.viewport.Width = m.rightPaneWidth()
		m.viewport.Height = m.viewportHeight()
		if m.parsed != nil || (m.showFullFile && m.fileContent != "") {
			m = m.withViewport()
		}
		return m, nil

	case sessionMsg:
		if msg.err != nil {
			logpkg.Error("session: %v", msg.err)
			return m, nil
		}
		m.session = msg.session
		logpkg.Debug("active session: %s", m.session.ID)
		if m.currentFile != "" {
			m.threadWg++
			return m, m.loadThreadsForFile()
		}
		return m, nil

	case changesMsg:
		m.err = msg.err
		m.changes = msg.changes
		m = m.refilter()
		if msg.err != nil {
			logpkg.Error("loading changes: %v", msg.err)
		} else {
			logpkg.Debug("loaded %d changes", len(msg.changes))
		}
		if m.visibleCount() > 0 {
			return m, m.loadDiffForCurrent()
		}
		return m, nil

	case diffMsg:
		fc, ok := m.selectedChange()
		if ok && fc.Path != msg.fileName {
			logpkg.Debug("ignoring stale diff for %s", msg.fileName)
			return m, nil
		}
		m.err = msg.err
		m.diffRaw = msg.content
		m.currentFile = msg.fileName
		m.showFullFile = false
		m.fileContent = ""
		m.diffCursor = 0
		m.searchActive = false
		m.searchQuery = ""
		m.searchMatches = nil
		m.searchIdx = 0
		m.showThreads = false
		m.threadDetail = nil
		m.threadComments = nil
		m.visualMode = false
		m.commentActive = false
		if msg.err != nil {
			logpkg.Error("loading diff for %s: %v", msg.fileName, msg.err)
		} else {
			logpkg.Debug("rendering diff for %s (%d bytes)", msg.fileName, len(msg.content))
		}
		m.parsed = parseDiffOutput(msg.content)
		logpkg.Debug("parsed %d diff lines", len(m.parsed.lines))
		m.viewport = viewport.New(m.rightPaneWidth(), m.viewportHeight())
		m = m.withViewport()
		m.threadWg++
		return m, m.loadThreadsForFile()

	case fileContentMsg:
		if msg.err != nil {
			logpkg.Error("reading file %s: %v", m.currentFile, msg.err)
			m.showFullFile = false
			return m, nil
		}
		m.fileContent = msg.content
		m.diffCursor = 0
		logpkg.Debug("loaded file content for %s (%d bytes)", m.currentFile, len(msg.content))
		m = m.withViewport()
		m.viewport.GotoTop()
		return m, nil

	case threadsMsg:
		if msg.err != nil {
			logpkg.Error("loading threads: %v", msg.err)
			return m, nil
		}
		if msg.seq != m.threadWg {
			return m, nil
		}
		if msg.filePath != m.currentFile {
			return m, nil
		}
		m.threads = msg.threads
		m.allComments = msg.comments
		logpkg.Debug("loaded %d threads for %s", len(m.threads), msg.filePath)
		if !m.showThreads {
			m = m.withViewport()
		}
		return m, nil

	case commentCreatedMsg:
		m.commentActive = false
		m.commentInput = ""
		m.visualMode = false
		if msg.err != nil {
			logpkg.Error("creating comment: %v", msg.err)
			m.err = msg.err
			return m, nil
		}
		m.threadWg++
		return m, m.loadThreadsForFile()

	case replyCreatedMsg:
		m.replyActive = false
		m.replyInput = ""
		if msg.err != nil {
			logpkg.Error("adding reply: %v", msg.err)
			return m, nil
		}
		if m.inlineReplyThread != nil {
			m.inlineReplyThread = nil
			m.threadDetail = nil
			m.threadWg++
			return m, m.loadThreadsForFile()
		}
		return m, m.reopenThreadDetail()

	case threadStatusMsg:
		if msg.err != nil {
			logpkg.Error("updating thread status: %v", msg.err)
			return m, nil
		}
		m.threadWg++
		if m.threadDetail != nil {
			return m, tea.Batch(m.loadThreadsForFile(), m.reopenThreadDetail())
		}
		return m, m.loadThreadsForFile()

	case threadDeletedMsg:
		if msg.err != nil {
			logpkg.Error("deleting thread: %v", msg.err)
			return m, nil
		}
		m.threadWg++
		return m, m.loadThreadsForFile()

	case threadDetailMsg:
		if msg.err != nil {
			logpkg.Error("loading thread detail: %v", msg.err)
			return m, nil
		}
		m.threadDetail = &msg.thread
		m.threadComments = msg.comments
		m.viewport = viewport.New(m.rightPaneWidth(), m.viewportHeight())
		m.viewport.SetContent(m.renderThreadDetailContent(m.rightPaneWidth()))
		return m, nil

	case tickMsg:
		var cmds []tea.Cmd
		cmds = append(cmds, tickCmd())
		if !m.commentActive && !m.replyActive && !m.filterActive && !m.searchActive && !m.gotoActive {
			cmds = append(cmds, m.softLoadChanges)
			if m.currentFile != "" && m.session != nil {
				m.threadWg++
				cmds = append(cmds, m.loadThreadsForFile())
			}
		}
		return m, tea.Batch(cmds...)

	case softChangesMsg:
		if msg.err != nil {
			return m, nil
		}
		oldFile := m.currentFile
		m.changes = msg.changes
		m = m.refilter()
		if oldFile != "" {
			for i, fc := range m.visibleChanges() {
				if fc.Path == oldFile {
					m.cursor = i
					break
				}
			}
		}
		// If no file was previously selected and changes appeared, load the diff.
		if oldFile == "" && m.visibleCount() > 0 {
			return m, m.loadDiffForCurrent()
		}
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "tab":
			if m.commentActive || m.replyActive || m.visualMode {
				return m, nil
			}
			if m.focus == paneFiles {
				m.focus = paneDiff
			} else {
				m.focus = paneFiles
			}
			return m, nil
		}

		if m.confirmDelete != nil {
			return m.updateConfirmDelete(msg)
		}

		switch m.focus {
		case paneFiles:
			return m.updateFilePane(msg)
		case paneDiff:
			return m.updateDiffPane(msg)
		}
	}
	return m, nil
}

func (m Model) updateConfirmDelete(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if msg.String() == "y" {
		id := m.confirmDelete.ID
		m.confirmDelete = nil
		st := m.store
		return m, func() tea.Msg {
			err := st.DeleteThread(id)
			return threadDeletedMsg{err: err}
		}
	}
	m.confirmDelete = nil
	return m, nil
}

func (m Model) reopenThreadDetail() tea.Cmd {
	if m.threadDetail == nil || m.store == nil {
		return nil
	}
	t := *m.threadDetail
	return m.openThreadDetail(t)
}

// --- File Pane ---

func (m Model) updateFilePane(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.filterActive {
		return m.updateFileFilter(msg)
	}
	prevCursor := m.cursor
	switch msg.String() {
	case "q":
		return m, tea.Quit
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < m.visibleCount()-1 {
			m.cursor++
		}
	case "enter", "l":
		m.focus = paneDiff
		fc, ok := m.selectedChange()
		if ok && fc.Path != m.currentFile {
			return m, m.loadDiffForCurrent()
		}
		return m, nil
	case "r":
		m.filterQuery = ""
		m.filtered = nil
		return m, m.loadChanges
	case "/":
		m.filterActive = true
		m.filterQuery = ""
		m = m.refilter()
		return m, nil
	}
	visible := m.visibleFileCount()
	if m.cursor < m.listOffset {
		m.listOffset = m.cursor
	}
	if m.cursor >= m.listOffset+visible {
		m.listOffset = m.cursor - visible + 1
	}
	if m.cursor != prevCursor && m.visibleCount() > 0 {
		return m, m.loadDiffForCurrent()
	}
	return m, nil
}

func (m Model) updateFileFilter(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "enter":
		m.filterActive = false
		m.focus = paneDiff
		fc, ok := m.selectedChange()
		if ok && fc.Path != m.currentFile {
			return m, m.loadDiffForCurrent()
		}
		return m, nil
	case "esc":
		m.filterActive = false
		m.filterQuery = ""
		m = m.refilter()
		if m.visibleCount() > 0 {
			return m, m.loadDiffForCurrent()
		}
		return m, nil
	case "up":
		if m.cursor > 0 {
			m.cursor--
		}
		if m.visibleCount() > 0 {
			return m, m.loadDiffForCurrent()
		}
		return m, nil
	case "down":
		if m.cursor < m.visibleCount()-1 {
			m.cursor++
		}
		if m.visibleCount() > 0 {
			return m, m.loadDiffForCurrent()
		}
		return m, nil
	case "backspace":
		if len(m.filterQuery) > 0 {
			_, size := utf8.DecodeLastRuneInString(m.filterQuery)
			m.filterQuery = m.filterQuery[:len(m.filterQuery)-size]
			m = m.refilter()
			if m.visibleCount() > 0 {
				return m, m.loadDiffForCurrent()
			}
		}
		return m, nil
	default:
		r := ""
		if msg.Type == tea.KeySpace {
			r = " "
		} else if msg.Type == tea.KeyRunes {
			r = string(msg.Runes)
		}
		if r != "" {
			m.filterQuery += r
			m = m.refilter()
			if m.visibleCount() > 0 {
				return m, m.loadDiffForCurrent()
			}
			return m, nil
		}
	}
	return m, nil
}

// --- Diff Pane ---

func (m Model) updateDiffPane(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.commentActive {
		return m.updateCommentInput(msg)
	}
	if m.replyActive {
		return m.updateReplyInput(msg)
	}
	if m.showThreads {
		if m.threadDetail != nil {
			return m.updateThreadDetail(msg)
		}
		return m.updateThreadList(msg)
	}
	if m.visualMode {
		return m.updateVisualMode(msg)
	}
	if m.gotoActive {
		return m.updateGotoLine(msg)
	}
	if m.searchActive {
		return m.updateDiffSearch(msg)
	}

	switch msg.String() {
	case "q", "esc", "h":
		m.focus = paneFiles
		return m, nil
	case "j", "down":
		m = m.moveCursor(1)
		return m, nil
	case "k", "up":
		m = m.moveCursor(-1)
		return m, nil
	case "ctrl+d":
		m = m.moveCursor(m.viewport.Height / 2)
		return m, nil
	case "ctrl+u":
		m = m.moveCursor(-m.viewport.Height / 2)
		return m, nil
	case ":":
		m.gotoActive = true
		m.gotoInput = ""
		return m, nil
	case "{":
		m = m.jumpBlock(-1)
		return m, nil
	case "}":
		m = m.jumpBlock(1)
		return m, nil
	case "g":
		m.diffCursor = 0
		m = m.moveCursor(0)
		return m, nil
	case "G":
		m.diffCursor = m.totalDiffLines() - 1
		if m.diffCursor < 0 {
			m.diffCursor = 0
		}
		m = m.moveCursor(0)
		return m, nil
	case "e":
		if !m.showFullFile {
			m.expanded = !m.expanded
			m.diffCursor = 0
			logpkg.Debug("toggled expand=%v for %s", m.expanded, m.currentFile)
			return m, m.loadDiffForCurrent()
		}
	case "f":
		m.showFullFile = !m.showFullFile
		m.diffCursor = 0
		m.searchQuery = ""
		m.searchMatches = nil
		m.searchIdx = 0
		logpkg.Debug("toggled fullFile=%v for %s", m.showFullFile, m.currentFile)
		if m.showFullFile && m.fileContent == "" {
			return m, m.loadFileContent()
		}
		m = m.withViewport()
		m.viewport.GotoTop()
		return m, nil
	case "/":
		m.searchActive = true
		m.searchQuery = ""
		m.searchMatches = nil
		m.searchIdx = 0
		m = m.withViewport()
		return m, nil
	case "n":
		if len(m.searchMatches) > 0 {
			m.searchIdx = (m.searchIdx + 1) % len(m.searchMatches)
			m.diffCursor = m.searchMatches[m.searchIdx]
			m = m.moveCursor(0)
		}
		return m, nil
	case "N":
		if len(m.searchMatches) > 0 {
			m.searchIdx = (m.searchIdx - 1 + len(m.searchMatches)) % len(m.searchMatches)
			m.diffCursor = m.searchMatches[m.searchIdx]
			m = m.moveCursor(0)
		}
		return m, nil
	case "c":
		if m.session == nil {
			return m, nil
		}
		if t := m.threadAtCursor(); t != nil && !t.IsOutdated {
			m.replyActive = true
			m.replyInput = ""
			m.inlineReplyThread = t
			m.threadDetail = t
			logpkg.Debug("inline reply opened for thread %s", t.ID)
			return m, nil
		}
		ln, ok := m.cursorToFileLine()
		if !ok {
			return m, nil
		}
		m.commentActive = true
		m.commentInput = ""
		m.commentLine = ln
		m.commentLineEnd = 0
		logpkg.Debug("comment input opened at line %d", ln)
		return m, nil
	case "r":
		if t := m.threadAtCursor(); t != nil && !t.IsOutdated {
			logpkg.Debug("inline resolve/reopen thread %s", t.ID)
			return m, m.toggleThread(t)
		}
		return m, nil
	case "v":
		m.visualMode = true
		m.visualStart = m.diffCursor
		logpkg.Debug("visual mode started at cursor %d", m.diffCursor)
		return m, nil
	case "t":
		m.showThreads = true
		m.threadCursor = 0
		m.threadDetail = nil
		return m, nil
	case "enter":
		if t := m.threadAtCursor(); t != nil {
			m.showThreads = true
			m.inlineDetailOpen = true
			return m, m.openThreadDetail(*t)
		}
		return m, nil
	case "d":
		if t := m.threadAtCursor(); t != nil && !t.IsOutdated {
			m.confirmDelete = t
		}
		return m, nil
	}
	return m, nil
}

func (m Model) updateVisualMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "j", "down":
		m = m.moveCursor(1)
		return m, nil
	case "k", "up":
		m = m.moveCursor(-1)
		return m, nil
	case "c":
		if m.session == nil {
			return m, nil
		}
		startLine, endLine, ok := m.visualRange()
		if !ok {
			m.visualMode = false
			return m, nil
		}
		m.commentActive = true
		m.commentInput = ""
		m.commentLine = startLine
		m.commentLineEnd = endLine
		logpkg.Debug("comment input opened for range %d-%d", startLine, endLine)
		return m, nil
	case "esc":
		m.visualMode = false
		m = m.withViewport()
		return m, nil
	}
	return m, nil
}

func (m Model) updateCommentInput(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "enter":
		if strings.TrimSpace(m.commentInput) == "" {
			return m, nil
		}
		m.visualMode = false
		return m, m.createComment()
	case "esc":
		m.commentActive = false
		m.commentInput = ""
		return m, nil
	case "backspace":
		if len(m.commentInput) > 0 {
			_, size := utf8.DecodeLastRuneInString(m.commentInput)
			m.commentInput = m.commentInput[:len(m.commentInput)-size]
		}
		return m, nil
	default:
		if msg.Type == tea.KeySpace {
			m.commentInput += " "
			return m, nil
		}
		if msg.Type == tea.KeyRunes {
			m.commentInput += string(msg.Runes)
			return m, nil
		}
	}
	return m, nil
}

func (m Model) updateDiffSearch(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "enter":
		m.searchActive = false
		if len(m.searchMatches) > 0 {
			m.searchIdx = 0
			m.diffCursor = m.searchMatches[0]
			m = m.moveCursor(0)
		}
		return m, nil
	case "esc":
		m.searchActive = false
		m.searchQuery = ""
		m.searchMatches = nil
		m.searchIdx = 0
		m = m.withViewport()
		return m, nil
	case "backspace":
		if len(m.searchQuery) > 0 {
			_, size := utf8.DecodeLastRuneInString(m.searchQuery)
			m.searchQuery = m.searchQuery[:len(m.searchQuery)-size]
			m.searchMatches = m.computeSearchMatches()
			if len(m.searchMatches) > 0 {
				m.searchIdx = 0
				m.diffCursor = m.searchMatches[0]
				m = m.moveCursor(0)
			} else {
				m = m.withViewport()
			}
		}
		return m, nil
	default:
		r := ""
		if msg.Type == tea.KeySpace {
			r = " "
		} else if msg.Type == tea.KeyRunes {
			r = string(msg.Runes)
		}
		if r != "" {
			m.searchQuery += r
			m.searchMatches = m.computeSearchMatches()
			if len(m.searchMatches) > 0 {
				m.searchIdx = 0
				m.diffCursor = m.searchMatches[0]
				m = m.moveCursor(0)
			} else {
				m = m.withViewport()
			}
			return m, nil
		}
	}
	return m, nil
}

func (m Model) updateGotoLine(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "enter":
		m.gotoActive = false
		n, err := strconv.Atoi(m.gotoInput)
		if err != nil || n < 1 {
			m.gotoInput = ""
			return m, nil
		}
		target := m.fileLineToIndex(n)
		m.diffCursor = target
		m = m.moveCursor(0)
		m.gotoInput = ""
		return m, nil
	case "esc":
		m.gotoActive = false
		m.gotoInput = ""
		return m, nil
	case "backspace":
		if len(m.gotoInput) > 0 {
			m.gotoInput = m.gotoInput[:len(m.gotoInput)-1]
		}
		return m, nil
	default:
		if msg.Type == tea.KeyRunes {
			for _, r := range msg.Runes {
				if r >= '0' && r <= '9' {
					m.gotoInput += string(r)
				}
			}
			return m, nil
		}
	}
	return m, nil
}

func (m Model) fileLineToIndex(lineNum int) int {
	if m.showFullFile {
		idx := lineNum - 1
		total := m.totalDiffLines()
		if idx < 0 {
			return 0
		}
		if idx >= total {
			return total - 1
		}
		return idx
	}
	if m.parsed == nil {
		return 0
	}
	for i, dl := range m.parsed.lines {
		if dl.newNum == lineNum {
			return i
		}
	}
	// Closest match: find the nearest line
	best := 0
	bestDist := -1
	for i, dl := range m.parsed.lines {
		if dl.newNum > 0 {
			dist := dl.newNum - lineNum
			if dist < 0 {
				dist = -dist
			}
			if bestDist < 0 || dist < bestDist {
				bestDist = dist
				best = i
			}
		}
	}
	return best
}

// --- Thread Panel ---

func (m Model) updateThreadList(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "t":
		m.showThreads = false
		m = m.withViewport()
		return m, nil
	case "j", "down":
		if m.threadCursor < len(m.threads)-1 {
			m.threadCursor++
		}
		return m, nil
	case "k", "up":
		if m.threadCursor > 0 {
			m.threadCursor--
		}
		return m, nil
	case "enter":
		if m.threadCursor < len(m.threads) {
			return m, m.openThreadDetail(m.threads[m.threadCursor])
		}
		return m, nil
	case "r":
		return m, m.toggleThreadStatus()
	case "d":
		if m.threadCursor < len(m.threads) {
			m.confirmDelete = &m.threads[m.threadCursor]
		}
		return m, nil
	}
	return m, nil
}

type threadDetailMsg struct {
	thread   review.Thread
	comments []review.Comment
	err      error
}

func (m Model) openThreadDetail(t review.Thread) tea.Cmd {
	st := m.store
	return func() tea.Msg {
		comments, err := st.ListComments(t.ID)
		return threadDetailMsg{thread: t, comments: comments, err: err}
	}
}

func (m Model) updateThreadDetail(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.threadDetail = nil
		m.threadComments = nil
		if m.inlineDetailOpen {
			m.showThreads = false
			m.inlineDetailOpen = false
		}
		return m, nil
	case "j", "down":
		var vp viewport.Model
		vp = m.viewport
		vp.LineDown(1)
		m.viewport = vp
		return m, nil
	case "k", "up":
		var vp viewport.Model
		vp = m.viewport
		vp.LineUp(1)
		m.viewport = vp
		return m, nil
	case "c":
		m.replyActive = true
		m.replyInput = ""
		return m, nil
	case "r":
		return m, m.toggleDetailThreadStatus()
	}
	return m, nil
}

func (m Model) updateReplyInput(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "enter":
		if strings.TrimSpace(m.replyInput) == "" {
			return m, nil
		}
		return m, m.addReply()
	case "esc":
		m.replyActive = false
		m.replyInput = ""
		if m.inlineReplyThread != nil {
			m.inlineReplyThread = nil
			m.threadDetail = nil
		}
		return m, nil
	case "backspace":
		if len(m.replyInput) > 0 {
			_, size := utf8.DecodeLastRuneInString(m.replyInput)
			m.replyInput = m.replyInput[:len(m.replyInput)-size]
		}
		return m, nil
	default:
		if msg.Type == tea.KeySpace {
			m.replyInput += " "
			return m, nil
		}
		if msg.Type == tea.KeyRunes {
			m.replyInput += string(msg.Runes)
			return m, nil
		}
	}
	return m, nil
}

// --- View ---

func (m Model) View() string {
	if !m.ready {
		return "  Loading..."
	}
	if m.confirmDelete != nil {
		return m.renderDeleteConfirmDialog()
	}
	if m.commentActive {
		return m.renderCommentDialog()
	}
	if m.replyActive {
		return m.renderReplyDialog()
	}
	contentH := m.height - 1
	if contentH < 3 {
		contentH = 3
	}
	left := m.renderFilePane(contentH)
	sep := m.renderSeparator(contentH)
	right := m.renderDiffPane(contentH)
	body := lipgloss.JoinHorizontal(lipgloss.Top, left, sep, right)
	footer := m.renderFooter()
	leftLines := strings.Count(left, "\n") + 1
	sepLines := strings.Count(sep, "\n") + 1
	rightLines := strings.Count(right, "\n") + 1
	bodyLines := strings.Count(body, "\n") + 1
	footerLines := strings.Count(footer, "\n") + 1
	totalLines := strings.Count(body+"\n"+footer, "\n") + 1
	logpkg.Debug("view: height=%d contentH=%d left=%d sep=%d right=%d body=%d footer=%d total=%d",
		m.height, contentH, leftLines, sepLines, rightLines, bodyLines, footerLines, totalLines)
	return body + "\n" + footer
}

func (m Model) renderCommentDialog() string {
	label := fmt.Sprintf("ln %d", m.commentLine)
	if m.commentLineEnd > 0 && m.commentLineEnd != m.commentLine {
		label = fmt.Sprintf("ln %d-%d", m.commentLine, m.commentLineEnd)
	}
	title := fmt.Sprintf("Comment on %s — %s", m.currentFile, label)

	var context string
	if m.parsed != nil && !m.showFullFile {
		for _, dl := range m.parsed.lines {
			if dl.newNum == m.commentLine {
				context = dl.content
				break
			}
		}
	} else if m.fileContent != "" {
		lines := strings.Split(m.fileContent, "\n")
		idx := m.commentLine - 1
		if idx >= 0 && idx < len(lines) {
			context = lines[idx]
		}
	}
	return m.renderDialog(title, context, m.commentInput)
}

func (m Model) renderReplyDialog() string {
	title := "Reply"
	if m.threadDetail != nil {
		title = fmt.Sprintf("Reply to thread — %s:%d", m.threadDetail.FilePath, m.threadDetail.CurrentLine)
	}
	return m.renderDialog(title, "", m.replyInput)
}

func (m Model) renderDialog(title, context, input string) string {
	boxW := m.width * 2 / 3
	if boxW < 40 {
		boxW = 40
	}
	if boxW > 80 {
		boxW = 80
	}
	innerW := boxW - 6

	var parts []string
	parts = append(parts, lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FAFAFA")).Render(title))

	if context != "" {
		parts = append(parts, "")
		if len(context) > innerW-4 {
			context = context[:innerW-7] + "..."
		}
		parts = append(parts, lipgloss.NewStyle().Foreground(mutedColor).Render("  │ "+context))
	}

	parts = append(parts, "")
	parts = append(parts, lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Render(input+"▏"))
	parts = append(parts, "")
	parts = append(parts, lipgloss.NewStyle().Foreground(mutedColor).Render("Enter to submit • Esc to cancel"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(accentColor).
		Padding(1, 2).
		Width(boxW).
		Render(strings.Join(parts, "\n"))

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m Model) renderDeleteConfirmDialog() string {
	t := m.confirmDelete
	boxW := m.width * 2 / 3
	if boxW < 40 {
		boxW = 40
	}
	if boxW > 60 {
		boxW = 60
	}

	title := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#EF4444")).Render("Delete Thread")

	label := fmt.Sprintf("%s:%d", t.FilePath, t.CurrentLine)
	if t.LineEnd > 0 && t.LineEnd != t.CurrentLine {
		label = fmt.Sprintf("%s:%d-%d", t.FilePath, t.CurrentLine, t.LineEnd)
	}

	comment := t.FirstComment
	innerW := boxW - 6
	if len(comment) > innerW-4 {
		comment = comment[:innerW-7] + "..."
	}

	var parts []string
	parts = append(parts, title)
	parts = append(parts, "")
	parts = append(parts, lipgloss.NewStyle().Foreground(mutedColor).Render(label))
	if comment != "" {
		parts = append(parts, lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Render("  │ "+comment))
	}
	parts = append(parts, "")
	parts = append(parts, lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Render("Are you sure?"))
	parts = append(parts, "")
	parts = append(parts, lipgloss.NewStyle().Foreground(mutedColor).Render("y to confirm • any other key to cancel"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#EF4444")).
		Padding(1, 2).
		Width(boxW).
		Render(strings.Join(parts, "\n"))

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m Model) renderFilePane(h int) string {
	sw := m.sidebarW
	var lines []string

	titleText := " Files"
	if m.filterActive {
		titleText = fmt.Sprintf(" /%s▏", m.filterQuery)
	} else if m.filterQuery != "" {
		titleText = fmt.Sprintf(" Files /%s", m.filterQuery)
	}
	if m.focus == paneFiles {
		lines = append(lines, titleStyle.Width(sw).MaxWidth(sw).Render(titleText))
	} else {
		lines = append(lines, subtitleStyle.Width(sw).MaxWidth(sw).Render(titleText))
	}

	if m.err != nil {
		lines = append(lines, normalStyle.Width(sw).MaxWidth(sw).Render(fmt.Sprintf(" Error: %v", m.err)))
	} else if m.visibleCount() == 0 {
		msg := " No changes"
		if m.filterQuery != "" {
			msg = " No matches"
		}
		lines = append(lines, normalStyle.Width(sw).MaxWidth(sw).Render(msg))
	} else {
		available := h - 1
		count := m.visibleCount()
		start := m.listOffset
		end := start + available
		if end > count {
			end = count
		}
		logpkg.Debug("filePane: sw=%d h=%d available=%d count=%d", sw, h, available, count)
		for i := start; i < end; i++ {
			var fc git.FileChange
			var matchIdxs []int
			if m.filtered != nil {
				fc = m.changes[m.filtered[i].Index]
				matchIdxs = m.filtered[i].MatchedIndexes
			} else {
				fc = m.changes[i]
			}
			marker := kindStyle(fc.Kind).Render(fc.Kind.Symbol())
			isSelected := i == m.cursor

			// Truncate the path so each entry stays on a single line.
			// Prefix is " M " (3 chars), so the path gets sw-3.
			maxPathW := sw - 3
			if maxPathW < 1 {
				maxPathW = 1
			}
			displayPath := fc.Path
			truncated := len(displayPath) - maxPathW
			if truncated < 0 {
				truncated = 0
			}
			if truncated > 0 {
				displayPath = displayPath[truncated:]
			}
			var path string
			if len(matchIdxs) > 0 {
				// Shift match indexes to account for truncation from the left.
				shifted := make([]int, 0, len(matchIdxs))
				for _, idx := range matchIdxs {
					if idx >= truncated {
						shifted = append(shifted, idx-truncated)
					}
				}
				path = highlightMatches(displayPath, shifted, isSelected)
			} else if isSelected {
				path = lipgloss.NewStyle().Foreground(lipgloss.Color("#FAFAFA")).Bold(true).Render(displayPath)
			} else {
				path = normalStyle.Render(displayPath)
			}
			entry := fmt.Sprintf(" %s %s", marker, path)
			if isSelected {
				lines = append(lines, lipgloss.NewStyle().Background(selectedBg).Width(sw).MaxWidth(sw).Render(entry))
			} else {
				lines = append(lines, lipgloss.NewStyle().Width(sw).MaxWidth(sw).Render(entry))
			}
		}
	}
	for len(lines) < h {
		lines = append(lines, strings.Repeat(" ", sw))
	}
	return strings.Join(lines[:h], "\n")
}

func highlightMatches(text string, matchIdxs []int, isSelected bool) string {
	matchSet := make(map[int]bool, len(matchIdxs))
	for _, idx := range matchIdxs {
		matchSet[idx] = true
	}
	baseFg := lipgloss.Color("#D4D4D8")
	if isSelected {
		baseFg = lipgloss.Color("#FAFAFA")
	}
	baseStyle := lipgloss.NewStyle().Foreground(baseFg)
	var result strings.Builder
	var batch strings.Builder
	wasMatch := false
	for i, ch := range text {
		isMatch := matchSet[i]
		if i > 0 && isMatch != wasMatch {
			if wasMatch {
				result.WriteString(matchCharStyle.Render(batch.String()))
			} else {
				result.WriteString(baseStyle.Render(batch.String()))
			}
			batch.Reset()
		}
		batch.WriteRune(ch)
		wasMatch = isMatch
	}
	if batch.Len() > 0 {
		if wasMatch {
			result.WriteString(matchCharStyle.Render(batch.String()))
		} else {
			result.WriteString(baseStyle.Render(batch.String()))
		}
	}
	return result.String()
}

func (m Model) renderSeparator(h int) string {
	style := lipgloss.NewStyle().Foreground(mutedColor)
	lines := make([]string, h)
	for i := range lines {
		lines[i] = style.Render("│")
	}
	return strings.Join(lines, "\n")
}

func (m Model) renderDiffPane(h int) string {
	rw := m.rightPaneWidth()
	var parts []string

	titleText := " Select a file"
	if m.showThreads && m.threadDetail != nil {
		titleText = fmt.Sprintf(" Thread on %s:%d", m.threadDetail.FilePath, m.threadDetail.CurrentLine)
	} else if m.showThreads {
		titleText = fmt.Sprintf(" Threads (%d)", len(m.threads))
	} else if m.currentFile != "" {
		titleText = fmt.Sprintf(" %s", m.currentFile)
	}
	if m.focus == paneDiff {
		parts = append(parts, titleStyle.Width(rw).MaxWidth(rw).Render(titleText))
	} else {
		parts = append(parts, subtitleStyle.Width(rw).MaxWidth(rw).Render(titleText))
	}

	sub := m.diffSubtitle(rw)
	parts = append(parts, subtitleStyle.Width(rw).MaxWidth(rw).Render(sub))

	contentH := h - 2
	if contentH < 0 {
		contentH = 0
	}

	if m.showThreads && m.threadDetail != nil {
		parts = append(parts, m.viewport.View())
	} else if m.showThreads {
		parts = append(parts, m.renderThreadListContent(rw, contentH))
	} else if m.parsed != nil {
		parts = append(parts, m.viewport.View())
	} else {
		emptyLines := make([]string, contentH)
		for i := range emptyLines {
			emptyLines[i] = strings.Repeat(" ", rw)
		}
		parts = append(parts, strings.Join(emptyLines, "\n"))
	}

	return strings.Join(parts, "\n")
}

func (m Model) diffSubtitle(rw int) string {
	if m.visualMode {
		lo := min(m.visualStart, m.diffCursor)
		hi := max(m.visualStart, m.diffCursor)
		return fmt.Sprintf(" Visual: %d-%d │ c comment │ esc cancel", lo+1, hi+1)
	}
	if m.gotoActive {
		return fmt.Sprintf(" :%s▏", m.gotoInput)
	}
	if m.searchActive {
		sub := fmt.Sprintf(" /%s▏", m.searchQuery)
		if m.searchQuery != "" && len(m.searchMatches) == 0 {
			sub += " (no matches)"
		} else if len(m.searchMatches) > 0 {
			sub += fmt.Sprintf(" (%d found)", len(m.searchMatches))
		}
		return sub
	}
	if m.showThreads && m.threadDetail != nil {
		s := string(m.threadDetail.Status)
		if m.threadDetail.IsOutdated {
			s += " outdated"
		}
		return fmt.Sprintf(" [%s] │ c reply │ r resolve/reopen │ esc back", s)
	}
	if m.showThreads {
		return " ↑↓ navigate │ enter detail │ r resolve/reopen │ d delete │ esc close"
	}
	if m.parsed != nil {
		mode := "Diff"
		if m.showFullFile {
			mode = "Source"
		}
		line := m.diffCursor + 1
		total := m.totalDiffLines()
		if m.searchQuery != "" && len(m.searchMatches) > 0 {
			return fmt.Sprintf(" %s │ /%s %d/%d │ ln %d/%d │ %3.f%%",
				mode, m.searchQuery, m.searchIdx+1, len(m.searchMatches),
				line, total, m.viewport.ScrollPercent()*100)
		}
		return fmt.Sprintf(" %s │ ln %d/%d │ %3.f%%", mode, line, total, m.viewport.ScrollPercent()*100)
	}
	return ""
}

func (m Model) renderFooter() string {
	var hints []string
	if m.focus == paneFiles && m.filterActive {
		hints = append(hints, "type to filter", "↑↓ navigate", "enter select", "esc clear")
	} else if m.focus == paneFiles {
		hints = append(hints, "↑↓/jk navigate", "enter/tab diff", "/ filter", "r refresh", "q quit")
	} else if m.visualMode {
		hints = append(hints, "↑↓/jk extend", "c comment", "esc cancel")
	} else if m.showThreads && m.threadDetail != nil {
		hints = append(hints, "↑↓ scroll", "c reply", "r resolve/reopen", "esc back")
	} else if m.showThreads {
		hints = append(hints, "↑↓/jk navigate", "enter detail", "r resolve/reopen", "d delete", "esc/t close")
	} else if m.searchActive {
		hints = append(hints, "type to search", "enter confirm", "esc cancel")
	} else {
		hints = append(hints, "↑↓/jk move", "{/} block", "ctrl+d/u page", "g/G top/bottom")
		if m.showFullFile {
			hints = append(hints, "f diff view")
		} else {
			hints = append(hints, "f source view")
			if m.expanded {
				hints = append(hints, "e collapse")
			} else {
				hints = append(hints, "e expand")
			}
		}
		hints = append(hints, "/ search")
		if t := m.threadAtCursor(); t != nil && !t.IsOutdated {
			hints = append(hints, "c reply", "r resolve/reopen", "enter detail", "d delete")
		} else {
			hints = append(hints, "c comment")
		}
		hints = append(hints, "v visual", "t threads")
		if len(m.searchMatches) > 0 {
			hints = append(hints, "n/N next/prev")
		}
		hints = append(hints, "tab/esc files")
	}
	return helpStyle.Width(m.width).MaxWidth(m.width).Render(strings.Join(hints, " • "))
}

func (m Model) visibleFileCount() int {
	h := m.height - 2
	if h < 1 {
		return 1
	}
	return h
}
