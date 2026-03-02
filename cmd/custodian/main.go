package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/janjiss/custodian/internal/git"
	logpkg "github.com/janjiss/custodian/internal/log"
	"github.com/janjiss/custodian/internal/store"
	"github.com/janjiss/custodian/internal/tui"
)

func main() {
	repo, err := git.OpenRepo()
	if err != nil {
		fmt.Fprintf(os.Stderr, "custodian: %v\n", err)
		os.Exit(1)
	}

	if err := logpkg.Init(repo.Root); err != nil {
		fmt.Fprintf(os.Stderr, "custodian: warning: could not init log: %v\n", err)
	}

	st, err := store.Open(repo.Root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "custodian: could not open store: %v\n", err)
		os.Exit(1)
	}
	defer st.Close()

	p := tea.NewProgram(tui.New(repo, st), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		logpkg.Error("program exited with error: %v", err)
		fmt.Fprintf(os.Stderr, "custodian: %v\n", err)
		os.Exit(1)
	}
}
