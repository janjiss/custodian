package log

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

var logger *log.Logger

func Init(repoRoot string) error {
	dir := filepath.Join(repoRoot, ".git", "custodian")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create log dir: %w", err)
	}

	path := filepath.Join(dir, "debug.log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open log file: %w", err)
	}

	logger = log.New(f, "", log.Ldate|log.Ltime|log.Lmicroseconds)
	logger.Printf("--- custodian started (log: %s) ---", path)
	return nil
}

func Debug(format string, args ...any) {
	if logger != nil {
		logger.Printf("[DEBUG] "+format, args...)
	}
}

func Error(format string, args ...any) {
	if logger != nil {
		logger.Printf("[ERROR] "+format, args...)
	}
}
