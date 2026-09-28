package discovery

import (
	"testing"
)

func TestDiscoverHardware(t *testing.T) {
	caps := DiscoverHardware()
	if caps.CpuLogicalCores <= 0 {
		t.Errorf("Expected positive CPU logical cores, got %d", caps.CpuLogicalCores)
	}
	if caps.MemoryMb <= 0 {
		t.Errorf("Expected positive memory, got %d", caps.MemoryMb)
	}
	if caps.OperatingSystem == "" {
		t.Errorf("Expected operating system to be non-empty")
	}
	if caps.DiscoveryStatus != "SUCCESS" {
		t.Errorf("Expected discovery status to be SUCCESS, got %s", caps.DiscoveryStatus)
	}

	if caps.GpuDiscoveryStatus == "FAILED" || caps.GpuDiscoveryStatus == "UNAVAILABLE" || caps.GpuDiscoveryStatus == "SUCCESS" {
		// Valid states
	} else {
		t.Errorf("Invalid GpuDiscoveryStatus: %s", caps.GpuDiscoveryStatus)
	}
}
