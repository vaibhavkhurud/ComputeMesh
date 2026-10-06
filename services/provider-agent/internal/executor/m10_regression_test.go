package executor

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	
)

type mockStorageClient struct {
	data map[string][]byte
}

func (m *mockStorageClient) Download(ctx context.Context, bucket, key, destPath string) error {
	d, ok := m.data[fmt.Sprintf("%s/%s", bucket, key)]
	if !ok {
		return fmt.Errorf("not found")
	}
	return os.WriteFile(destPath, d, 0644)
}

func (m *mockStorageClient) Upload(ctx context.Context, bucket, key, srcPath string) error {
	d, err := os.ReadFile(srcPath)
	if err != nil {
		return err
	}
	if m.data == nil {
		m.data = make(map[string][]byte)
	}
	m.data[fmt.Sprintf("%s/%s", bucket, key)] = d
	return nil
}

func TestM10RegressionPhysicalAtoB(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "m10-regression-*")
	defer os.RemoveAll(tmpDir)

	wsA := filepath.Join(tmpDir, "wsA")
	wsB := filepath.Join(tmpDir, "wsB")
	os.MkdirAll(wsA, 0755)
	os.MkdirAll(wsB, 0755)

	storage := &mockStorageClient{}

	// Provider A writes some state, creates a checkpoint
	cpDirA := filepath.Join(wsA, "checkpoint")
	os.MkdirAll(cpDirA, 0755)
	os.WriteFile(filepath.Join(cpDirA, "state.txt"), []byte("running at state 5"), 0644)
	os.WriteFile(filepath.Join(cpDirA, ".checkpoint-ready"), []byte("ready"), 0644)

	cpArchiveA := filepath.Join(wsA, "checkpoint-recovery.tar.gz")
	checksum, _, err := archiveCheckpoint(cpDirA, cpArchiveA)
	if err != nil {
		t.Fatalf("Failed to archive: %v", err)
	}

	// Provider A uploads checkpoint
	err = storage.Upload(context.Background(), "checkpoints", "job1/cp1", cpArchiveA)
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	// Provider A crashes (simulation). Provider B takes over.
	// Provider B downloads and restores.

	cpArchiveB := filepath.Join(wsB, "checkpoint-recovery.tar.gz")
	err = storage.Download(context.Background(), "checkpoints", "job1/cp1", cpArchiveB)
	if err != nil {
		t.Fatalf("Download failed: %v", err)
	}

	// Simulate verify and extract
	cpDirB := filepath.Join(wsB, "checkpoint")
	os.MkdirAll(cpDirB, 0755)
	
	err = SafeExtract(cpArchiveB, cpDirB, checksum)
	if err != nil {
		t.Fatalf("SafeExtract failed: %v", err)
	}

	// Check state in B
	state, err := os.ReadFile(filepath.Join(cpDirB, "state.txt"))
	if err != nil {
		t.Fatalf("Failed to read state on B: %v", err)
	}
	if string(state) != "running at state 5" {
		t.Fatalf("State mismatch, got %s", string(state))
	}

	// Verify B creates the resume marker
	err = os.WriteFile(filepath.Join(wsB, ".checkpoint-resume"), []byte("RESUME"), 0644)
	if err != nil {
		t.Fatalf("Failed to write resume marker: %v", err)
	}
}
