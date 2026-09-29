package executor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
	"github.com/docker/docker/api/types/container"
)

func DownloadFile(ctx context.Context, url string, dest string) error {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	
	_, err = io.Copy(out, resp.Body)
	return err
}

func VerifySHA256(path string, expected string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	
	computed := hex.EncodeToString(h.Sum(nil))
	if computed != expected {
		return fmt.Errorf("checksum mismatch: got %s, want %s", computed, expected)
	}
	return nil
}

type AgentAPIClient interface {
	GetAssignments(ctx context.Context) ([]Assignment, error)
	StartExecution(ctx context.Context, assignmentId string) error
	ReportRunning(ctx context.Context, assignmentId string) error
	ReportResult(ctx context.Context, assignmentId string, status string, failureReason string) error
	GetStatus(ctx context.Context, assignmentId string) (string, error)
	RenewLease(ctx context.Context, assignmentId string) error
}

type Assignment struct {
	AssignmentID       string `json:"assignmentId"`
	JobID              string `json:"jobId"`
	TrustedImage       string `json:"trustedImage"`
	InputBucket        string `json:"inputBucket"`
	InputKey           string `json:"inputKey"`
	CheckpointUrl      string `json:"checkpointUrl,omitempty"`
	CheckpointChecksum string `json:"checkpointChecksum,omitempty"`
}

type ExecutionLoop struct {
	api       AgentAPIClient
	executor  *DockerExecutor
	workspace *WorkspaceManager
	storage   StorageClient
}

func NewExecutionLoop(api AgentAPIClient, baseDir string) (*ExecutionLoop, error) {
	exec, err := NewDockerExecutor()
	if err != nil {
		return nil, err
	}
	return &ExecutionLoop{
		api:       api,
		executor:  exec,
		workspace: NewWorkspaceManager(baseDir),
		storage:   NewSeaweedStorageClient("http://localhost:8333"),
	}, nil
}

func (l *ExecutionLoop) CleanupOrphans() {
	log.Println("Cleaning up orphaned workspaces and containers...")
	// For M8, we simply remove the entire workspaces directory and rely on Docker's restart=no for containers
	// (or we could list and kill cm-* containers). Let's just purge the workspace directory to ensure clean state.
	l.workspace.CleanupWorkspace("/tmp/computemesh-workspaces")
}

func (l *ExecutionLoop) PollAndExecute(ctx context.Context) {
	assignments, err := l.api.GetAssignments(ctx)
	if err != nil {
		log.Printf("Error fetching assignments: %v", err)
		return
	}
	if len(assignments) == 0 {
		return
	}

	assignment := assignments[0]
	log.Printf("Picked up assignment %s for job %s", assignment.AssignmentID, assignment.JobID)

	// 1. Atomically claim
	if err := l.api.StartExecution(ctx, assignment.AssignmentID); err != nil {
		log.Printf("Failed to claim assignment %s: %v", assignment.AssignmentID, err)
		return // lost race or cancelled
	}
	log.Printf("Successfully claimed assignment %s", assignment.AssignmentID)

	// 2. Preflight disk
	if err := l.workspace.CheckDiskPreflight(1024 * 1024 * 1024); err != nil {
		log.Printf("Disk preflight failed for %s: %v", assignment.AssignmentID, err)
		l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "disk preflight failed")
		return
	}

	// 3. Workspace
	wsPath, err := l.workspace.CreateWorkspace(assignment.JobID, assignment.AssignmentID)
	if err != nil {
		log.Printf("Workspace creation failed for %s: %v", assignment.AssignmentID, err)
		l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "workspace creation failed")
		return
	}
	log.Printf("Workspace created at %s", wsPath)
	defer l.workspace.CleanupWorkspace(wsPath)

	// 4. Download Input
	if assignment.InputBucket != "" && assignment.InputKey != "" {
		log.Printf("Downloading input from %s/%s", assignment.InputBucket, assignment.InputKey)
		inputPath := wsPath + "/input.zip"
		if err := l.storage.Download(ctx, assignment.InputBucket, assignment.InputKey, inputPath); err != nil {
			log.Printf("Failed to download input for %s: %v", assignment.AssignmentID, err)
			l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "failed to download input")
			return
		}
	} else {
		log.Printf("No input to download for %s", assignment.AssignmentID)
	}

	// 4.5 M10 Recovery - Checkpoint Restoration
	if assignment.CheckpointUrl != "" && assignment.CheckpointChecksum != "" {
		log.Printf("Recovering checkpoint from %s", assignment.CheckpointUrl)
		
		cpArchive := wsPath + "/checkpoint-recovery.tar.gz"
		
		// 1. Download
		if err := DownloadFile(ctx, assignment.CheckpointUrl, cpArchive); err != nil {
			log.Printf("Failed to download checkpoint: %v", err)
			l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "failed to download checkpoint")
			return
		}

		// 2. SHA-256 & 3. Compare
		if err := VerifySHA256(cpArchive, assignment.CheckpointChecksum); err != nil {
			log.Printf("Checkpoint integrity verification failed: %v", err)
			l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "checkpoint integrity failed")
			return
		}

		// 4. SafeExtract
		if err := SafeExtract(cpArchive, wsPath); err != nil {
			log.Printf("Checkpoint SafeExtract failed: %v", err)
			l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "checkpoint extract failed")
			return
		}

		// 5. Create .checkpoint-resume
		if err := os.WriteFile(wsPath+"/.checkpoint-resume", []byte("RESUME"), 0644); err != nil {
			log.Printf("Failed to create .checkpoint-resume marker: %v", err)
			l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "failed to create resume marker")
			return
		}

		log.Println("Checkpoint restoration successfully completed")
	}

	// 5. Execute
	execCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()

	cfg := ExecutionConfig{
		Image:       assignment.TrustedImage,
		Workspace:   wsPath,
		NanoCPUs:    1000000000,
		MemoryBytes: 512 * 1024 * 1024,
		PidsLimit:   512,
		GPUCount:    0,
	}

	log.Printf("Starting execution for assignment %s with image %s", assignment.AssignmentID, assignment.TrustedImage)
	containerID, err := l.executor.Execute(execCtx, cfg)
	if err != nil {
		log.Printf("Failed to execute: %v", err)
		l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", err.Error())
		return
	}

	// 6. Report Running
	if err := l.api.ReportRunning(ctx, assignment.AssignmentID); err != nil {
		log.Printf("Failed to report running: %v", err)
		return
	}
	log.Printf("Reported assignment %s as RUNNING", assignment.AssignmentID)

	leaseRenewCtx, cancelLease := context.WithCancel(context.Background())
	defer cancelLease()

	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		defer ticker.Stop()
		lastSuccess := time.Now()

		for {
			select {
			case <-leaseRenewCtx.Done():
				return
			case <-ticker.C:
				err := l.api.RenewLease(ctx, assignment.AssignmentID)
				if err != nil {
					log.Printf("Failed to renew lease for %s: %v", assignment.AssignmentID, err)
					if time.Since(lastSuccess) > 5*time.Minute {
						log.Printf("Safety deadline exceeded for %s, killing container", assignment.AssignmentID)
						_ = l.executor.client.ContainerKill(context.Background(), containerID, "SIGKILL")
						cancel()
						return
					}
				} else {
					lastSuccess = time.Now()
				}
			}
		}
	}()

	// 7. Polling loop for cancellation
	// Wait for container completion logic here (ContainerWait)
	statusCh, errCh := l.executor.client.ContainerWait(execCtx, containerID, container.WaitConditionNotRunning)
	select {
	case err := <-errCh:
		if err != nil {
			log.Printf("Container error: %v", err)
			l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", err.Error())
			return
		}
	case <-statusCh:
		// Done
	case <-execCtx.Done():
		log.Printf("Execution timeout or cancelled")
		_ = l.executor.client.ContainerKill(context.Background(), containerID, "SIGKILL")
		l.api.ReportResult(ctx, assignment.AssignmentID, "CANCELLED", "context cancelled")
		return
	}

	log.Printf("Container %s finished. Uploading results.", containerID)

	// 8. Upload Output
	outputPath := wsPath + "/output/result.zip"
	// For testing, just write a dummy file if not exists
	// Usually the container should create this
	_ = l.storage.Upload(ctx, "computemesh-outputs", "job-"+assignment.JobID+"-output.zip", outputPath)

	l.api.ReportResult(ctx, assignment.AssignmentID, "COMPLETED", "")
	log.Printf("Assignment %s COMPLETED", assignment.AssignmentID)
}
