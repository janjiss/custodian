package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	logpkg "github.com/janjiss/custodian/internal/log"
)

type ChangeKind int

const (
	Modified ChangeKind = iota
	Added
	Deleted
	Renamed
	Copied
	Untracked
)

func (k ChangeKind) Symbol() string {
	switch k {
	case Modified:
		return "M"
	case Added:
		return "A"
	case Deleted:
		return "D"
	case Renamed:
		return "R"
	case Copied:
		return "C"
	case Untracked:
		return "?"
	default:
		return " "
	}
}

type FileChange struct {
	Path     string
	OldPath  string
	Kind     ChangeKind
	Staged   bool
	Unstaged bool
}

type Repo struct {
	Root    string
	Name    string
	HasHEAD bool
}

func OpenRepo() (*Repo, error) {
	return OpenRepoAt("")
}

func OpenRepoAt(dir string) (*Repo, error) {
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	if dir != "" {
		cmd.Dir = dir
	}
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("not a git repository (or git is not installed)")
	}
	root := strings.TrimSpace(string(out))
	hasHEAD := exec.Command("git", "-C", root, "rev-parse", "HEAD").Run() == nil

	logpkg.Debug("repo root=%s hasHEAD=%v", root, hasHEAD)
	return &Repo{
		Root:    root,
		Name:    filepath.Base(root),
		HasHEAD: hasHEAD,
	}, nil
}

func (r *Repo) Changes() ([]FileChange, error) {
	// -uall lists individual untracked files instead of collapsing directories
	cmd := exec.Command("git", "status", "--porcelain=v1", "-uall")
	cmd.Dir = r.Root
	out, err := cmd.Output()
	if err != nil {
		logpkg.Error("git status failed: %v", err)
		return nil, fmt.Errorf("git status: %w", err)
	}

	changes, err := parsePorcelain(string(out))
	if err != nil {
		return nil, err
	}
	logpkg.Debug("found %d changed files", len(changes))
	for _, fc := range changes {
		logpkg.Debug("  %s %s (staged=%v unstaged=%v)", fc.Kind.Symbol(), fc.Path, fc.Staged, fc.Unstaged)
	}
	return changes, nil
}

func parsePorcelain(output string) ([]FileChange, error) {
	var changes []FileChange
	for _, line := range strings.Split(output, "\n") {
		if len(line) < 4 {
			continue
		}

		x := line[0] // index (staged) status
		y := line[1] // working tree (unstaged) status
		path := line[3:]

		// Skip directory entries (trailing slash) as a safety net
		if strings.HasSuffix(path, "/") {
			logpkg.Debug("skipping directory entry: %s", path)
			continue
		}

		oldPath := ""
		if idx := strings.Index(path, " -> "); idx != -1 {
			oldPath = path[:idx]
			path = path[idx+4:]
		}

		fc := FileChange{
			Path:    path,
			OldPath: oldPath,
		}

		switch {
		case x == '?' && y == '?':
			fc.Kind = Untracked
			fc.Unstaged = true
		default:
			if x != ' ' && x != '?' {
				fc.Staged = true
				fc.Kind = charToKind(x)
			}
			if y != ' ' && y != '?' {
				fc.Unstaged = true
				if !fc.Staged {
					fc.Kind = charToKind(y)
				}
			}
		}

		changes = append(changes, fc)
	}
	return changes, nil
}

func charToKind(c byte) ChangeKind {
	switch c {
	case 'M':
		return Modified
	case 'A':
		return Added
	case 'D':
		return Deleted
	case 'R':
		return Renamed
	case 'C':
		return Copied
	default:
		return Modified
	}
}

func (r *Repo) Diff(fc FileChange, contextLines int) (string, error) {
	logpkg.Debug("diff requested: path=%s kind=%s context=%d", fc.Path, fc.Kind.Symbol(), contextLines)

	if fc.Kind == Untracked {
		return r.diffUntracked(fc.Path)
	}

	ctx := fmt.Sprintf("-U%d", contextLines)

	if r.HasHEAD {
		out, err := r.git("diff", ctx, "HEAD", "--", fc.Path)
		if err == nil && len(strings.TrimSpace(out)) > 0 {
			logpkg.Debug("diff HEAD succeeded for %s (%d bytes)", fc.Path, len(out))
			return out, nil
		}
	}

	out, err := r.git("diff", ctx, "--cached", "--", fc.Path)
	if err == nil && len(strings.TrimSpace(out)) > 0 {
		logpkg.Debug("diff --cached succeeded for %s (%d bytes)", fc.Path, len(out))
		return out, nil
	}

	out, err = r.git("diff", ctx, "--", fc.Path)
	if err == nil && len(strings.TrimSpace(out)) > 0 {
		logpkg.Debug("diff working tree succeeded for %s (%d bytes)", fc.Path, len(out))
		return out, nil
	}

	logpkg.Debug("no diff available for %s", fc.Path)
	return "(no diff available)", nil
}

func (r *Repo) diffUntracked(path string) (string, error) {
	fullPath := filepath.Join(r.Root, path)

	// Guard against directories — git diff --no-index with a dir looks for
	// a file named after the other argument inside that dir, which fails.
	info, err := os.Stat(fullPath)
	if err != nil {
		logpkg.Error("stat failed for untracked path %s: %v", fullPath, err)
		return fmt.Sprintf("(cannot read %s: %v)", path, err), nil
	}
	if info.IsDir() {
		logpkg.Debug("skipping diff for directory: %s", path)
		return fmt.Sprintf("(directory: %s)", path), nil
	}

	cmd := exec.Command("git", "diff", "--no-index", "--", "/dev/null", fullPath)
	cmd.Dir = r.Root
	logpkg.Debug("running: git diff --no-index -- /dev/null %s", fullPath)
	// git diff --no-index exits 1 when there are differences, which is expected
	out, _ := cmd.CombinedOutput()
	if len(out) > 0 {
		logpkg.Debug("untracked diff for %s: %d bytes", path, len(out))
		return string(out), nil
	}
	return "(empty file)", nil
}

func (r *Repo) ReadFile(path string) (string, error) {
	fullPath := filepath.Join(r.Root, path)
	info, err := os.Stat(fullPath)
	if err != nil {
		logpkg.Error("ReadFile stat %s: %v", fullPath, err)
		return "", fmt.Errorf("cannot access %s: %w", path, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("%s is a directory", path)
	}
	data, err := os.ReadFile(fullPath)
	if err != nil {
		logpkg.Error("ReadFile read %s: %v", fullPath, err)
		return "", err
	}
	logpkg.Debug("ReadFile %s: %d bytes", path, len(data))
	return string(data), nil
}

func (r *Repo) Stage(path string) error {
	_, err := r.git("add", "--", path)
	if err != nil {
		logpkg.Error("git add %s: %v", path, err)
		return fmt.Errorf("git add %s: %w", path, err)
	}
	logpkg.Debug("staged %s", path)
	return nil
}

func (r *Repo) Unstage(path string) error {
	// Use restore --staged which handles all cases: tracked files, new files,
	// and is a no-op if the file is already unstaged.
	_, err := r.git("restore", "--staged", "--", path)
	if err == nil {
		logpkg.Debug("unstaged %s", path)
		return nil
	}
	// Fallback for older git versions without restore.
	logpkg.Debug("restore --staged failed for %s, trying reset HEAD", path)
	_, err = r.git("reset", "HEAD", "--", path)
	if err == nil {
		logpkg.Debug("unstaged %s (reset HEAD)", path)
		return nil
	}
	// Last resort for files not in HEAD (newly added).
	logpkg.Debug("reset HEAD failed for %s, trying rm --cached", path)
	_, err = r.git("rm", "--cached", "--", path)
	if err != nil {
		logpkg.Error("git unstage %s: all methods failed", path)
		return fmt.Errorf("git unstage %s: %w", path, err)
	}
	logpkg.Debug("unstaged %s (rm --cached)", path)
	return nil
}

func (r *Repo) git(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = r.Root
	out, err := cmd.Output()
	if err != nil {
		logpkg.Debug("git %v failed: %v", args, err)
	}
	return string(out), err
}
