//go:build linux

package executor

import (
	"context"
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-units"
)

type DockerExecutor struct {
	client *client.Client
}

func NewDockerExecutor() (*DockerExecutor, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &DockerExecutor{client: cli}, nil
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
	if !strings.Contains(cfg.Image, "@sha256:") {
		return "", fmt.Errorf("security violation: image must be immutable digest pinned: %s", cfg.Image)
	}

	_, err := d.client.ImagePull(ctx, cfg.Image, image.PullOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to pull image: %w", err)
	}

	hostConfig := &container.HostConfig{
		Privileged:      false,
		ReadonlyRootfs:  true,
		CapDrop:         []string{"ALL"},
		SecurityOpt:     []string{"no-new-privileges=true"},
		NetworkMode:     "none",
		PidMode:         "", // Private PID namespace
		IpcMode:         "", // Private IPC namespace
		ShmSize:         64 * 1024 * 1024,
		Binds:           []string{fmt.Sprintf("%s:/workspace", cfg.Workspace)}, // We will assume nosuid,nodev are set on the tempfs mount itself by the OS
		Resources: container.Resources{
			NanoCPUs:   cfg.NanoCPUs,
			Memory:     cfg.MemoryBytes,
			MemorySwap: cfg.MemoryBytes, // Prevent swap
			PidsLimit:  &cfg.PidsLimit,
			Ulimits: []*units.Ulimit{
				{Name: "nofile", Soft: 1024, Hard: 2048},
				{Name: "nproc", Soft: 512, Hard: 512},
			},
		},
	}

	if cfg.GPUCount > 0 {
		hostConfig.DeviceRequests = []container.DeviceRequest{
			{
				Driver:       "nvidia",
				Count:        cfg.GPUCount,
				Capabilities: [][]string{{"gpu"}},
			},
		}
	}

	resp, err := d.client.ContainerCreate(ctx, &container.Config{
		Image: cfg.Image,
		Cmd:   []string{"sh", "/workspace/run.sh"},
		User:  "1000:1000", // Enforce non-root (assuming trusted images follow this)
	}, hostConfig, &network.NetworkingConfig{}, nil, "")
	if err != nil {
		return "", fmt.Errorf("failed to create container: %w", err)
	}

	if err := d.client.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return resp.ID, fmt.Errorf("failed to start container: %w", err)
	}

	return resp.ID, nil
}
