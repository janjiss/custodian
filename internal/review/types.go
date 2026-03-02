package review

import "time"

type ThreadStatus string

const (
	ThreadOpen     ThreadStatus = "open"
	ThreadResolved ThreadStatus = "resolved"
)

type Author string

const (
	AuthorHuman Author = "human"
	AuthorModel Author = "model"
)

type ReviewSession struct {
	ID        string    `json:"id"`
	RepoRoot  string    `json:"repo_root"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Thread struct {
	ID            string       `json:"id"`
	SessionID     string       `json:"session_id"`
	FilePath      string       `json:"file_path"`
	Side          string       `json:"side"`
	OriginalLine  int          `json:"original_line"`
	LineEnd       int          `json:"line_end,omitempty"`
	CurrentLine   int          `json:"current_line"`
	AnchorContent string       `json:"anchor_content"`
	ContextBefore string       `json:"context_before"`
	ContextAfter  string       `json:"context_after"`
	IsOutdated    bool         `json:"is_outdated"`
	Status        ThreadStatus `json:"status"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`

	// Populated by queries, not stored directly on the thread row.
	CommentCount int    `json:"comment_count,omitempty"`
	FirstComment string `json:"first_comment,omitempty"`
}

type Comment struct {
	ID        string    `json:"id"`
	ThreadID  string    `json:"thread_id"`
	Author    Author    `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

type ActionKind string

const (
	ActionReplyPosted    ActionKind = "reply_posted"
	ActionPatchApplied   ActionKind = "patch_applied"
	ActionThreadResolved ActionKind = "thread_resolved"
	ActionThreadReopened ActionKind = "thread_reopened"
)

type Action struct {
	ID        string            `json:"id"`
	SessionID string            `json:"session_id"`
	Kind      ActionKind        `json:"kind"`
	ThreadID  string            `json:"thread_id,omitempty"`
	CreatedAt time.Time         `json:"created_at"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}
