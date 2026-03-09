package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/janjiss/custodian/internal/review"
	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(repoRoot string) (*Store, error) {
	dir := filepath.Join(repoRoot, ".git", "custodian")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create store dir: %w", err)
	}
	dbPath := filepath.Join(dir, "review.db")
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(wal)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(schema)
	return err
}

const schema = `
CREATE TABLE IF NOT EXISTS sessions (
	id         TEXT PRIMARY KEY,
	repo_root  TEXT NOT NULL,
	active     INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
	id              TEXT PRIMARY KEY,
	session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	file_path       TEXT NOT NULL,
	side            TEXT NOT NULL DEFAULT 'new',
	original_line   INTEGER NOT NULL DEFAULT 0,
	line_end        INTEGER NOT NULL DEFAULT 0,
	current_line    INTEGER NOT NULL DEFAULT 0,
	anchor_content  TEXT NOT NULL DEFAULT '',
	context_before  TEXT NOT NULL DEFAULT '',
	context_after   TEXT NOT NULL DEFAULT '',
	is_outdated     INTEGER NOT NULL DEFAULT 0,
	status          TEXT NOT NULL DEFAULT 'open',
	created_at      TEXT NOT NULL,
	updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
	id         TEXT PRIMARY KEY,
	thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
	author     TEXT NOT NULL,
	body       TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_session  ON threads(session_id);
CREATE INDEX IF NOT EXISTS idx_threads_file     ON threads(file_path);
CREATE INDEX IF NOT EXISTS idx_comments_thread  ON comments(thread_id);
`

// --- Sessions ---

func (s *Store) CreateSession(repoRoot string) (*review.ReviewSession, error) {
	s.db.Exec("UPDATE sessions SET active = 0 WHERE active = 1")
	now := time.Now()
	sess := &review.ReviewSession{
		ID:        uuid.New().String(),
		RepoRoot:  repoRoot,
		Active:    true,
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err := s.db.Exec(
		"INSERT INTO sessions (id, repo_root, active, created_at, updated_at) VALUES (?,?,1,?,?)",
		sess.ID, sess.RepoRoot, fmtTime(now), fmtTime(now),
	)
	return sess, err
}

func (s *Store) ActiveSession() (*review.ReviewSession, error) {
	row := s.db.QueryRow(
		"SELECT id, repo_root, created_at, updated_at FROM sessions WHERE active = 1 ORDER BY created_at DESC LIMIT 1",
	)
	sess := &review.ReviewSession{Active: true}
	var ca, ua string
	err := row.Scan(&sess.ID, &sess.RepoRoot, &ca, &ua)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sess.CreatedAt, _ = time.Parse(time.RFC3339Nano, ca)
	sess.UpdatedAt, _ = time.Parse(time.RFC3339Nano, ua)
	return sess, nil
}

func (s *Store) ClearSession(id string) error {
	_, err := s.db.Exec("DELETE FROM sessions WHERE id = ?", id)
	return err
}

// --- Threads ---

func (s *Store) CreateThread(t *review.Thread) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	now := time.Now()
	t.CreatedAt = now
	t.UpdatedAt = now
	_, err := s.db.Exec(`
		INSERT INTO threads (id, session_id, file_path, side, original_line, line_end,
			current_line, anchor_content, context_before, context_after,
			is_outdated, status, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		t.ID, t.SessionID, t.FilePath, t.Side,
		t.OriginalLine, t.LineEnd, t.CurrentLine,
		t.AnchorContent, t.ContextBefore, t.ContextAfter,
		boolToInt(t.IsOutdated), string(t.Status),
		fmtTime(now), fmtTime(now),
	)
	return err
}

func (s *Store) ListThreads(sessionID, filePath string) ([]review.Thread, error) {
	query := `
		SELECT t.id, t.session_id, t.file_path, t.side,
			t.original_line, t.line_end, t.current_line,
			t.anchor_content, t.context_before, t.context_after,
			t.is_outdated, t.status, t.created_at, t.updated_at,
			COALESCE((SELECT COUNT(*) FROM comments WHERE thread_id = t.id), 0),
			COALESCE((SELECT body FROM comments WHERE thread_id = t.id ORDER BY created_at LIMIT 1), '')
		FROM threads t
		WHERE t.session_id = ?`
	args := []any{sessionID}
	if filePath != "" {
		query += " AND t.file_path = ?"
		args = append(args, filePath)
	}
	query += " ORDER BY t.file_path, t.original_line"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []review.Thread
	for rows.Next() {
		var t review.Thread
		var outdated int
		var ca, ua string
		err := rows.Scan(
			&t.ID, &t.SessionID, &t.FilePath, &t.Side,
			&t.OriginalLine, &t.LineEnd, &t.CurrentLine,
			&t.AnchorContent, &t.ContextBefore, &t.ContextAfter,
			&outdated, &t.Status, &ca, &ua,
			&t.CommentCount, &t.FirstComment,
		)
		if err != nil {
			return nil, err
		}
		t.IsOutdated = outdated != 0
		t.CreatedAt, _ = time.Parse(time.RFC3339Nano, ca)
		t.UpdatedAt, _ = time.Parse(time.RFC3339Nano, ua)
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

// ThreadCountsByFile returns a map of file_path → open thread count for the session.
func (s *Store) ThreadCountsByFile(sessionID string) (map[string]int, error) {
	rows, err := s.db.Query(`
		SELECT file_path, COUNT(*) FROM threads
		WHERE session_id = ? AND status = 'open'
		GROUP BY file_path`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := make(map[string]int)
	for rows.Next() {
		var fp string
		var n int
		if err := rows.Scan(&fp, &n); err != nil {
			return nil, err
		}
		counts[fp] = n
	}
	return counts, rows.Err()
}

func (s *Store) UpdateThreadLine(id string, currentLine int, outdated bool) error {
	_, err := s.db.Exec(
		"UPDATE threads SET current_line = ?, is_outdated = ?, updated_at = ? WHERE id = ?",
		currentLine, boolToInt(outdated), fmtTime(time.Now()), id,
	)
	return err
}

func (s *Store) UpdateThreadStatus(id string, status review.ThreadStatus) error {
	_, err := s.db.Exec(
		"UPDATE threads SET status = ?, updated_at = ? WHERE id = ?",
		string(status), fmtTime(time.Now()), id,
	)
	return err
}

func (s *Store) DeleteThread(id string) error {
	_, err := s.db.Exec("DELETE FROM threads WHERE id = ?", id)
	return err
}

// --- Comments ---

func (s *Store) AddComment(c *review.Comment) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	if c.CreatedAt.IsZero() {
		c.CreatedAt = time.Now()
	}
	_, err := s.db.Exec(
		"INSERT INTO comments (id, thread_id, author, body, created_at) VALUES (?,?,?,?,?)",
		c.ID, c.ThreadID, string(c.Author), c.Body, fmtTime(c.CreatedAt),
	)
	return err
}

func (s *Store) ListComments(threadID string) ([]review.Comment, error) {
	rows, err := s.db.Query(
		"SELECT id, thread_id, author, body, created_at FROM comments WHERE thread_id = ? ORDER BY created_at",
		threadID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []review.Comment
	for rows.Next() {
		var c review.Comment
		var ca string
		if err := rows.Scan(&c.ID, &c.ThreadID, &c.Author, &c.Body, &ca); err != nil {
			return nil, err
		}
		c.CreatedAt, _ = time.Parse(time.RFC3339Nano, ca)
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

func (s *Store) ListCommentsForThreads(threadIDs []string) (map[string][]review.Comment, error) {
	if len(threadIDs) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(threadIDs))
	args := make([]any, len(threadIDs))
	for i, id := range threadIDs {
		placeholders[i] = "?"
		args[i] = id
	}
	query := "SELECT id, thread_id, author, body, created_at FROM comments WHERE thread_id IN (" +
		strings.Join(placeholders, ",") + ") ORDER BY created_at"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]review.Comment)
	for rows.Next() {
		var c review.Comment
		var ca string
		if err := rows.Scan(&c.ID, &c.ThreadID, &c.Author, &c.Body, &ca); err != nil {
			return nil, err
		}
		c.CreatedAt, _ = time.Parse(time.RFC3339Nano, ca)
		result[c.ThreadID] = append(result[c.ThreadID], c)
	}
	return result, rows.Err()
}

// --- Helpers ---

func fmtTime(t time.Time) string {
	return t.Format(time.RFC3339Nano)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
