package executor

import (
	"fmt"
	"os"
	"path/filepath"
)

type WorkspaceManager struct {
	baseDir string
}

func NewWorkspaceManager(baseDir string) *WorkspaceManager {
	return &WorkspaceManager{baseDir: baseDir}
}

func (w *WorkspaceManager) CreateWorkspace(jobId, executionId string) (string, error) {
	// e.g. /tmp/computemesh-job-<jobId>-<executionId>
	// Sanitize inputs internally if needed, though they come from trusted API
	path := filepath.Join(w.baseDir, fmt.Sprintf("computemesh-job-%s-%s", jobId, executionId))
	
	if err := os.MkdirAll(path, 0755); err != nil {
		return "", fmt.Errorf("failed to create workspace: %w", err)
	}

	// Create output dir
	outPath := filepath.Join(path, "output")
	if err := os.MkdirAll(outPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create output dir: %w", err)
	}

	return path, nil
}

func (w *WorkspaceManager) CleanupWorkspace(path string) error {
	// Ensure we only delete under baseDir
	if !filepath.HasPrefix(path, w.baseDir) {
		return fmt.Errorf("security violation: path %s is not inside base directory", path)
	}
	return os.RemoveAll(path)
}

func (w *WorkspaceManager) CheckDiskPreflight(requiredBytes int64) error {
	// active disk polling logic for preflight
	// If standard project quotas are unavailable, we evaluate df locally.
	// For simulation, we return nil
	return nil
}
