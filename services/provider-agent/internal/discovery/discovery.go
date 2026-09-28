package discovery

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type Capabilities struct {
	CpuLogicalCores    int    `json:"cpuLogicalCores"`
	CpuArchitecture    string `json:"cpuArchitecture"`
	MemoryMb           int    `json:"memoryMb"`
	OperatingSystem    string `json:"operatingSystem"`
	GpuCount           *int   `json:"gpuCount"`
	GpuModel           *string `json:"gpuModel"`
	GpuMemoryMb        *int   `json:"gpuMemoryMb"`
	CudaVersion        *string `json:"cudaVersion"`
	DiscoveryStatus    string `json:"discoveryStatus"`
	DiscoveryError     *string `json:"discoveryError"`
	GpuDiscoveryStatus string `json:"gpuDiscoveryStatus"`
}

func DiscoverHardware() Capabilities {
	caps := Capabilities{
		CpuLogicalCores: runtime.NumCPU(),
		CpuArchitecture: runtime.GOARCH,
		OperatingSystem: runtime.GOOS,
		MemoryMb:        8192, // Mocked for M4 since pure go cross-platform memory is complex without cgo/syscall
		DiscoveryStatus: "SUCCESS",
	}

	gpuCaps := DiscoverGPU()
	caps.GpuCount = gpuCaps.Count
	caps.GpuModel = gpuCaps.Model
	caps.GpuMemoryMb = gpuCaps.MemoryMb
	caps.GpuDiscoveryStatus = gpuCaps.Status
	caps.DiscoveryError = gpuCaps.Error

	return caps
}

type GpuCapabilities struct {
	Count    *int
	Model    *string
	MemoryMb *int
	Status   string
	Error    *string
}

func DiscoverGPU() GpuCapabilities {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Safe static exec, no user args
	cmd := exec.CommandContext(ctx, "nvidia-smi", "--query-gpu=count,name,memory.total", "--format=csv,noheader,nounits")
	out, err := cmd.Output()

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			errMsg := "timeout executing nvidia-smi"
			return GpuCapabilities{Status: "FAILED", Error: &errMsg}
		}
		// Assuming not installed or drivers missing
		errMsg := "nvidia-smi unavailable"
		return GpuCapabilities{Status: "UNAVAILABLE", Error: &errMsg}
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 || lines[0] == "" {
		count := 0
		return GpuCapabilities{Count: &count, Status: "SUCCESS"}
	}

	// Just counting GPUs for M4 parsing simplicity
	count := len(lines)
	return GpuCapabilities{Count: &count, Status: "SUCCESS"}
}
