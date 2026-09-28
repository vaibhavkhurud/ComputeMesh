//go:build !linux

package executor

import (
	"context"
	"fmt"
)

type DockerExecutor struct {
}

func NewDockerExecutor() (*DockerExecutor, error) {
	return nil, fmt.Errorf("ComputeMesh M7 execution is supported on Linux only")
}

type ExecutionConfig struct {
	Image       string
	Workspace   string
	NanoCPUs    int64
	MemoryBytes int64
	PidsLimit   int64
	GPUCount    int
}

func (d *DockerExecutor) Execute(ctx context.Context, cfg ExecutionConfig) (string, error) {
	return "", fmt.Errorf("ComputeMesh M7 execution is supported on Linux only")
}
