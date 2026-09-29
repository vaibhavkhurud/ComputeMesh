package executor

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSafeExtract(t *testing.T) {
	tests := []struct{
		name string
		target string
		typeflag byte
		linkname string
		expectedErr string
	}{
		{"Path Traversal 1", "../evil.txt", tar.TypeReg, "", "path traversal attempt rejected: ../evil.txt"},
		{"Path Traversal 2", "../../evil.txt", tar.TypeReg, "", "path traversal attempt rejected: ../../evil.txt"},
		{"Absolute Path Unix", "/etc/passwd", tar.TypeReg, "", "path traversal attempt rejected: /etc/passwd"},
		{"Absolute Path Windows", "C:\\Windows\\System32\\cmd.exe", tar.TypeReg, "", "path traversal attempt rejected: C:\\Windows\\System32\\cmd.exe"},
		{"Symlink", "link", tar.TypeSymlink, "/etc/passwd", "symlinks and hardlinks are rejected for security"},
		{"Hardlink", "hard", tar.TypeLink, "somefile", "symlinks and hardlinks are rejected for security"},
		{"FIFO", "fifo", tar.TypeFifo, "", "unsupported file type: 54"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir, _ := os.MkdirTemp("", "extract-test-*")
			defer os.RemoveAll(tmpDir)
			
			archivePath := filepath.Join(tmpDir, "evil.tar.gz")
			f, _ := os.Create(archivePath)
			gw := gzip.NewWriter(f)
			tw := tar.NewWriter(gw)
			
			tw.WriteHeader(&tar.Header{
				Name: tt.target,
				Typeflag: tt.typeflag,
				Linkname: tt.linkname,
				Mode: 0600,
				Size: 5,
			})
			tw.Write([]byte("hello"))
			tw.Close()
			gw.Close()
			f.Close()

			destDir := filepath.Join(tmpDir, "dest")
			os.Mkdir(destDir, 0755)

			err := SafeExtract(archivePath, destDir)
			if err == nil {
				t.Fatalf("expected error for %s, got nil", tt.name)
			}
			if tt.expectedErr != "" && err.Error() != tt.expectedErr && !strings.Contains(err.Error(), "path traversal") {
				t.Fatalf("unexpected error message: %v", err)
			}
		})
	}
}

func TestArchiveExclude(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "archive-test-*")
	defer os.RemoveAll(tmpDir)

	srcDir := filepath.Join(tmpDir, "checkpoint")
	os.MkdirAll(srcDir, 0755)

	os.WriteFile(filepath.Join(srcDir, "data.txt"), []byte("data"), 0644)
	os.WriteFile(filepath.Join(srcDir, ".checkpoint-ready"), []byte("ready"), 0644)
	os.WriteFile(filepath.Join(srcDir, ".checkpoint-resume"), []byte("resume"), 0644)

	archivePath := filepath.Join(tmpDir, "archive.tar.gz")
	
	_, _, err := archiveCheckpoint(srcDir, archivePath)
	if err != nil {
		t.Fatalf("archive failed: %v", err)
	}

	// Verify exclusions
	f, _ := os.Open(archivePath)
	gr, _ := gzip.NewReader(f)
	tr := tar.NewReader(gr)

	foundData := false
	for {
		hdr, err := tr.Next()
		if err != nil {
			break
		}
		if hdr.Name == "data.txt" {
			foundData = true
		}
		if hdr.Name == ".checkpoint-ready" || hdr.Name == ".checkpoint-resume" {
			t.Fatalf("marker file included in archive: %s", hdr.Name)
		}
	}
	if !foundData {
		t.Fatalf("expected data.txt to be in archive")
	}
}
