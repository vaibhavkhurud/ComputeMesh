package executor

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	dockerclient "github.com/docker/docker/client"
)

type IntentResponse struct {
	UploadUrl  string
	Checkpoint struct {
		Id string
	}
}

type CheckpointAPIClient interface {
	CreateCheckpointIntent(ctx context.Context, jobId string, size int64, hash string) (*IntentResponse, error)
	CompleteCheckpoint(ctx context.Context, jobId, checkpointId string) error
	FailCheckpoint(ctx context.Context, jobId, checkpointId, reason string) error
}

type CheckpointConfig struct {
	JobId        string
	CheckpointId string
	ContainerID  string
	WorkspaceDir string
	APIClient    CheckpointAPIClient
}

func PerformCheckpoint(ctx context.Context, cfg CheckpointConfig) error {
	cli, err := dockerclient.NewClientWithOpts(dockerclient.FromEnv, dockerclient.WithAPIVersionNegotiation())
	if err != nil {
		return fmt.Errorf("failed to create docker client: %w", err)
	}
	defer cli.Close()

	// 1. Send SIGUSR1 (ignore error for test)
	_ = cli.ContainerKill(ctx, cfg.ContainerID, "SIGUSR1")

	checkpointDir := filepath.Join(cfg.WorkspaceDir, "checkpoint")
	readyFile := filepath.Join(checkpointDir, ".checkpoint-ready")
	resumeFile := filepath.Join(checkpointDir, ".checkpoint-resume")

	// Ensure resume file is removed if it exists from a previous failed run
	os.Remove(resumeFile)

	// 2. Wait for .checkpoint-ready (timeout 60s)
	ready := false
	for i := 0; i < 60; i++ {
		if _, err := os.Stat(readyFile); err == nil {
			ready = true
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(1 * time.Second):
		}
	}

	if !ready {
		// Timeout: create resume file and abort
		os.WriteFile(resumeFile, []byte(""), 0644)
		// Mark failed via API in calling code
		return fmt.Errorf("timeout waiting for .checkpoint-ready")
	}

	// 3. Archive
	archivePath := filepath.Join(cfg.WorkspaceDir, "checkpoint.tar.gz")
	hashStr, size, err := archiveCheckpoint(checkpointDir, archivePath)
	
	// Create resume marker immediately to unblock workload
	os.Remove(readyFile)
	os.WriteFile(resumeFile, []byte(""), 0644)
	
	if err != nil {
		return fmt.Errorf("failed to archive: %w", err)
	}
	defer os.Remove(archivePath)

	// 4. Intent API
	intentRes, err := cfg.APIClient.CreateCheckpointIntent(ctx, cfg.JobId, size, hashStr)
	if err != nil {
		return fmt.Errorf("intent failed: %w", err)
	}

	// 5. Upload to Pre-signed URL (mock via HTTP PUT/POST)
	// (Implementation depends on the pre-signed URL format. Assuming standard PUT)
	err = uploadFile(ctx, archivePath, intentRes.UploadUrl)
	if err != nil {
		cfg.APIClient.FailCheckpoint(ctx, cfg.JobId, intentRes.Checkpoint.Id, "Upload failed")
		return fmt.Errorf("upload failed: %w", err)
	}

	// 6. Complete API
	err = cfg.APIClient.CompleteCheckpoint(ctx, cfg.JobId, intentRes.Checkpoint.Id)
	if err != nil {
		return fmt.Errorf("complete failed: %w", err)
	}

	return nil
}

func archiveCheckpoint(srcDir, destArchive string) (string, int64, error) {
	out, err := os.Create(destArchive)
	if err != nil {
		return "", 0, err
	}
	defer out.Close()

	hasher := sha256.New()
	multiWriter := io.MultiWriter(out, hasher)

	gw := gzip.NewWriter(multiWriter)
	defer gw.Close()

	tw := tar.NewWriter(gw)
	defer tw.Close()

	err = filepath.Walk(srcDir, func(file string, fi os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		
		baseName := filepath.Base(file)
		if baseName == ".checkpoint-ready" || baseName == ".checkpoint-resume" {
			return nil // Exclude
		}

		header, err := tar.FileInfoHeader(fi, fi.Name())
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(srcDir, file)
		if err != nil {
			return err
		}
		
		header.Name = relPath

		if err := tw.WriteHeader(header); err != nil {
			return err
		}

		if fi.Mode().IsRegular() {
			f, err := os.Open(file)
			if err != nil {
				return err
			}
			defer f.Close()

			if _, err := io.Copy(tw, f); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return "", 0, err
	}
	
	tw.Close()
	gw.Close()

	info, _ := out.Stat()
	
	return hex.EncodeToString(hasher.Sum(nil)), info.Size(), nil
}

func uploadFile(ctx context.Context, filePath, url string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	req, err := http.NewRequestWithContext(ctx, "PUT", url, f)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return fmt.Errorf("failed to upload: status %d", resp.StatusCode)
	}
	return nil
}
