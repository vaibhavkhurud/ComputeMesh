package executor_test

import (
	"context"
	"testing"


	"computemesh-agent/internal/executor"
)

func TestSmokeDocker(t *testing.T) {
	d, err := executor.NewDockerExecutor()
	if err != nil {
		t.Fatalf("Failed to init docker executor: %v", err)
	}

	// We use Execute, but since it sleeps for 3600s, we will cancel context after 5s.
	ctx := context.Background()
	_, err = d.Execute(ctx, executor.ExecutionConfig{
		Image:     "hello-world@sha256:5e23090353324d887c48ad5e5c56d294eab81588df9605b07d1afe895f9cc8f8",
		Workspace: "/tmp/smoke-ws",
	})
	
	if err != nil {
		t.Fatalf("Docker run failed: %v", err)
	}
	t.Log("Docker executor successfully pulled and ran the workload!")
}
