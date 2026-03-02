package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/janjiss/custodian/internal/git"
	logpkg "github.com/janjiss/custodian/internal/log"
	"github.com/janjiss/custodian/internal/review"
	"github.com/janjiss/custodian/internal/store"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func NewServer(repo *git.Repo, st *store.Store) *server.MCPServer {
	s := server.NewMCPServer(
		"custodian",
		"0.1.0",
		server.WithToolCapabilities(false),
	)

	ctx := &toolCtx{repo: repo, store: st}

	s.AddTool(listChangesTool(), ctx.handleListChanges)
	s.AddTool(listThreadsTool(), ctx.handleListThreads)
	s.AddTool(replyThreadTool(), ctx.handleReplyThread)
	s.AddTool(resolveThreadTool(), ctx.handleResolveThread)
	s.AddTool(reopenThreadTool(), ctx.handleReopenThread)
	s.AddTool(applyEditTool(), ctx.handleApplyEdit)

	return s
}

type toolCtx struct {
	repo  *git.Repo
	store *store.Store
}

// --- Tool Definitions ---

func listChangesTool() mcp.Tool {
	return mcp.NewTool("review_list_changes",
		mcp.WithDescription("List uncommitted file changes in the repository. Returns file paths, change kind (added/modified/deleted/untracked), and unresolved thread counts."),
	)
}

func listThreadsTool() mcp.Tool {
	return mcp.NewTool("review_list_threads",
		mcp.WithDescription("List open review threads. Optionally filter by file path. Returns thread ID, file, line, status, first comment, and comment count."),
		mcp.WithString("file_path",
			mcp.Description("Filter threads to a specific file path (relative to repo root). Omit to list all threads."),
		),
		mcp.WithString("status",
			mcp.Description("Filter by thread status."),
			mcp.Enum("open", "resolved", "all"),
		),
	)
}

func replyThreadTool() mcp.Tool {
	return mcp.NewTool("review_reply_thread",
		mcp.WithDescription("Post a reply comment to an existing review thread."),
		mcp.WithString("thread_id",
			mcp.Required(),
			mcp.Description("The ID of the thread to reply to."),
		),
		mcp.WithString("body",
			mcp.Required(),
			mcp.Description("The reply comment body text."),
		),
	)
}

func resolveThreadTool() mcp.Tool {
	return mcp.NewTool("review_resolve_thread",
		mcp.WithDescription("Mark a review thread as resolved."),
		mcp.WithString("thread_id",
			mcp.Required(),
			mcp.Description("The ID of the thread to resolve."),
		),
	)
}

func reopenThreadTool() mcp.Tool {
	return mcp.NewTool("review_reopen_thread",
		mcp.WithDescription("Reopen a previously resolved review thread."),
		mcp.WithString("thread_id",
			mcp.Required(),
			mcp.Description("The ID of the thread to reopen."),
		),
	)
}

func applyEditTool() mcp.Tool {
	return mcp.NewTool("review_apply_edit",
		mcp.WithDescription("Write new content to a file in the repository. Use this to apply code fixes in response to review feedback."),
		mcp.WithString("file_path",
			mcp.Required(),
			mcp.Description("File path relative to the repository root."),
		),
		mcp.WithString("content",
			mcp.Required(),
			mcp.Description("The full new file content to write."),
		),
	)
}

// --- Handlers ---

func (c *toolCtx) activeSession() (*review.ReviewSession, error) {
	sess, err := c.store.ActiveSession()
	if err != nil {
		return nil, fmt.Errorf("failed to get active session: %w", err)
	}
	if sess == nil {
		sess, err = c.store.CreateSession(c.repo.Root)
		if err != nil {
			return nil, fmt.Errorf("failed to create session: %w", err)
		}
	}
	return sess, nil
}

func changeKindName(k git.ChangeKind) string {
	switch k {
	case git.Modified:
		return "modified"
	case git.Added:
		return "added"
	case git.Deleted:
		return "deleted"
	case git.Renamed:
		return "renamed"
	case git.Copied:
		return "copied"
	case git.Untracked:
		return "untracked"
	default:
		return "unknown"
	}
}

type changeResult struct {
	Path   string `json:"path"`
	Kind   string `json:"kind"`
	Symbol string `json:"symbol"`
}

func (c *toolCtx) handleListChanges(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	changes, err := c.repo.Changes()
	if err != nil {
		logpkg.Error("mcp list_changes: %v", err)
		return mcp.NewToolResultError(fmt.Sprintf("failed to list changes: %v", err)), nil
	}

	results := make([]changeResult, len(changes))
	for i, fc := range changes {
		results[i] = changeResult{
			Path:   fc.Path,
			Kind:   changeKindName(fc.Kind),
			Symbol: fc.Kind.Symbol(),
		}
	}

	b, _ := json.MarshalIndent(results, "", "  ")
	logpkg.Debug("mcp list_changes: returning %d changes", len(results))
	return mcp.NewToolResultText(string(b)), nil
}

type threadResult struct {
	ID           string `json:"id"`
	FilePath     string `json:"file_path"`
	Line         int    `json:"line"`
	LineEnd      int    `json:"line_end,omitempty"`
	Status       string `json:"status"`
	IsOutdated   bool   `json:"is_outdated,omitempty"`
	CommentCount int    `json:"comment_count"`
	FirstComment string `json:"first_comment"`
}

func (c *toolCtx) handleListThreads(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	sess, err := c.activeSession()
	if err != nil {
		logpkg.Error("mcp list_threads: %v", err)
		return mcp.NewToolResultError(err.Error()), nil
	}

	filePath := req.GetString("file_path", "")
	statusFilter := req.GetString("status", "open")

	threads, err := c.store.ListThreads(sess.ID, filePath)
	if err != nil {
		logpkg.Error("mcp list_threads: %v", err)
		return mcp.NewToolResultError(fmt.Sprintf("failed to list threads: %v", err)), nil
	}

	if filePath != "" {
		content, readErr := c.repo.ReadFile(filePath)
		if readErr == nil {
			lines := strings.Split(content, "\n")
			threads = review.RelocateThreads(threads, lines)
			for _, t := range threads {
				c.store.UpdateThreadLine(t.ID, t.CurrentLine, t.IsOutdated)
			}
		}
	}

	var results []threadResult
	for _, t := range threads {
		if statusFilter != "all" && string(t.Status) != statusFilter {
			continue
		}
		results = append(results, threadResult{
			ID:           t.ID,
			FilePath:     t.FilePath,
			Line:         t.CurrentLine,
			LineEnd:      t.LineEnd,
			Status:       string(t.Status),
			IsOutdated:   t.IsOutdated,
			CommentCount: t.CommentCount,
			FirstComment: t.FirstComment,
		})
	}

	b, _ := json.MarshalIndent(results, "", "  ")
	logpkg.Debug("mcp list_threads: returning %d threads", len(results))
	return mcp.NewToolResultText(string(b)), nil
}

func (c *toolCtx) handleReplyThread(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	threadID, err := req.RequireString("thread_id")
	if err != nil {
		return mcp.NewToolResultError("thread_id is required"), nil
	}
	body, err := req.RequireString("body")
	if err != nil {
		return mcp.NewToolResultError("body is required"), nil
	}

	comment := &review.Comment{
		ThreadID: threadID,
		Author:   review.AuthorModel,
		Body:     body,
	}
	if err := c.store.AddComment(comment); err != nil {
		logpkg.Error("mcp reply_thread: %v", err)
		return mcp.NewToolResultError(fmt.Sprintf("failed to add reply: %v", err)), nil
	}

	logpkg.Debug("mcp reply_thread: added comment %s to thread %s", comment.ID, threadID)
	return mcp.NewToolResultText(fmt.Sprintf("Reply added to thread %s", threadID)), nil
}

func (c *toolCtx) handleResolveThread(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	threadID, err := req.RequireString("thread_id")
	if err != nil {
		return mcp.NewToolResultError("thread_id is required"), nil
	}

	if err := c.store.UpdateThreadStatus(threadID, review.ThreadResolved); err != nil {
		logpkg.Error("mcp resolve_thread: %v", err)
		return mcp.NewToolResultError(fmt.Sprintf("failed to resolve thread: %v", err)), nil
	}

	logpkg.Debug("mcp resolve_thread: resolved %s", threadID)
	return mcp.NewToolResultText(fmt.Sprintf("Thread %s resolved", threadID)), nil
}

func (c *toolCtx) handleReopenThread(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	threadID, err := req.RequireString("thread_id")
	if err != nil {
		return mcp.NewToolResultError("thread_id is required"), nil
	}

	if err := c.store.UpdateThreadStatus(threadID, review.ThreadOpen); err != nil {
		logpkg.Error("mcp reopen_thread: %v", err)
		return mcp.NewToolResultError(fmt.Sprintf("failed to reopen thread: %v", err)), nil
	}

	logpkg.Debug("mcp reopen_thread: reopened %s", threadID)
	return mcp.NewToolResultText(fmt.Sprintf("Thread %s reopened", threadID)), nil
}

func (c *toolCtx) handleApplyEdit(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	filePath, err := req.RequireString("file_path")
	if err != nil {
		return mcp.NewToolResultError("file_path is required"), nil
	}
	content, err := req.RequireString("content")
	if err != nil {
		return mcp.NewToolResultError("content is required"), nil
	}

	absPath := filepath.Join(c.repo.Root, filePath)

	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		logpkg.Error("mcp apply_edit: mkdir %s: %v", dir, err)
		return mcp.NewToolResultError(fmt.Sprintf("failed to create directory: %v", err)), nil
	}

	if err := os.WriteFile(absPath, []byte(content), 0o644); err != nil {
		logpkg.Error("mcp apply_edit: write %s: %v", absPath, err)
		return mcp.NewToolResultError(fmt.Sprintf("failed to write file: %v", err)), nil
	}

	logpkg.Debug("mcp apply_edit: wrote %d bytes to %s", len(content), filePath)
	return mcp.NewToolResultText(fmt.Sprintf("File %s updated (%d bytes)", filePath, len(content))), nil
}
