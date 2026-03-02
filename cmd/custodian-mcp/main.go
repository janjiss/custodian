package main

import (
	"fmt"
	"os"

	"github.com/janjiss/custodian/internal/git"
	logpkg "github.com/janjiss/custodian/internal/log"
	mcppkg "github.com/janjiss/custodian/internal/mcp"
	"github.com/janjiss/custodian/internal/store"
	"github.com/mark3labs/mcp-go/server"
)

func main() {
	repo, err := git.OpenRepo()
	if err != nil {
		fmt.Fprintf(os.Stderr, "custodian-mcp: %v\n", err)
		os.Exit(1)
	}

	if err := logpkg.Init(repo.Root); err != nil {
		fmt.Fprintf(os.Stderr, "custodian-mcp: warning: could not init log: %v\n", err)
	}

	st, err := store.Open(repo.Root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "custodian-mcp: could not open store: %v\n", err)
		os.Exit(1)
	}
	defer st.Close()

	logpkg.Debug("custodian-mcp server starting")
	s := mcppkg.NewServer(repo, st)
	if err := server.ServeStdio(s); err != nil {
		logpkg.Error("mcp server error: %v", err)
		fmt.Fprintf(os.Stderr, "custodian-mcp: %v\n", err)
		os.Exit(1)
	}
}
