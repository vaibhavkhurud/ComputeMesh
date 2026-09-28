package executor

import (
	"context"
	"fmt"
	"time"
)

type AgentAPIClient interface {
	GetAssignments(ctx context.Context) ([]Assignment, error)
	StartExecution(ctx context.Context, assignmentId string) error
	ReportRunning(ctx context.Context, assignmentId string) error
	ReportResult(ctx context.Context, assignmentId string, status string, failureReason string) error
	GetStatus(ctx context.Context, assignmentId string) (string, error)
}

type Assignment struct {
	AssignmentID string
	JobID        string
	TrustedImage string
}

type ExecutionLoop struct {
	api       AgentAPIClient
	executor  *DockerExecutor
	workspace *WorkspaceManager
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
	}, nil
}

func (l *ExecutionLoop) PollAndExecute(ctx context.Context) {
	assignments, err := l.api.GetAssignments(ctx)
	if err != nil || len(assignments) == 0 {
		return
	}

	assignment := assignments[0]

	// 1. Atomically claim
	if err := l.api.StartExecution(ctx, assignment.AssignmentID); err != nil {
		return // lost race or cancelled
	}

	// 2. Preflight disk
	if err := l.workspace.CheckDiskPreflight(1024 * 1024 * 1024); err != nil {
		l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "disk preflight failed")
		return
	}

	// 3. Workspace
	wsPath, err := l.workspace.CreateWorkspace(assignment.JobID, assignment.AssignmentID)
	if err != nil {
		l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", "workspace creation failed")
		return
	}
	defer l.workspace.CleanupWorkspace(wsPath)

	// 4. Download Input (mocked via SeaweedFS client)
	
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

	containerID, err := l.executor.Execute(execCtx, cfg)
	if err != nil {
		l.api.ReportResult(ctx, assignment.AssignmentID, "FAILED", err.Error())
		return
	}

	// 6. Report Running
	if err := l.api.ReportRunning(ctx, assignment.AssignmentID); err != nil {
		// Cancelled during startup race
		// Cleanup happens via defer + Docker teardown
		return
	}

	// 7. Polling loop for cancellation
	// We'd have a goroutine polling l.api.GetStatus() and calling cancel() on execCtx if CANCELLED

	// Wait for container completion logic here (ContainerWait)
	_ = containerID

	// 8. Upload Output
	// ...

	l.api.ReportResult(ctx, assignment.AssignmentID, "COMPLETED", "")
}
