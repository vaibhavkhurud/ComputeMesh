package executor

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractLimits(t *testing.T) {
	tests := []struct{
		name string
		setup func(*tar.Writer)
		expectedErr string
	}{
		{
			"Too Many Files",
			func(tw *tar.Writer) {
				for i := 0; i < 100001; i++ {
					tw.WriteHeader(&tar.Header{Name: "file.txt", Size: 0, Mode: 0644})
				}
			},
			"exceeded max file count",
		},
		{
			"Too Big Extracted Size",
			func(tw *tar.Writer) {
				tw.WriteHeader(&tar.Header{Name: "big.txt", Size: 10737418241}) // 10 GB + 1 byte
				// Not actually writing 10GB, just the header
			},
			"decompression ratio or max size exceeded",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir, _ := os.MkdirTemp("", "extract-test-*")
			defer os.RemoveAll(tmpDir)
			
			archivePath := filepath.Join(tmpDir, "test.tar.gz")
			f, _ := os.Create(archivePath)
			gw := gzip.NewWriter(f)
			tw := tar.NewWriter(gw)
			
			tt.setup(tw)
			
			tw.Close()
			gw.Close()
			f.Close()

			destDir := filepath.Join(tmpDir, "dest")
			os.Mkdir(destDir, 0755)

			err := SafeExtract(archivePath, destDir)
			if err == nil {
				t.Fatalf("expected error for %s, got nil", tt.name)
			}
			if !strings.Contains(err.Error(), tt.expectedErr) {
				t.Fatalf("unexpected error message: %v", err)
			}
		})
	}
}
