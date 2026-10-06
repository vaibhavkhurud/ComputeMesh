package executor

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func SafeExtract(archivePath, destDir, expectedSHA256 string) error {
	if expectedSHA256 != "" {
		if err := VerifySHA256(archivePath, expectedSHA256); err != nil {
			return fmt.Errorf("checksum mismatch: %w", err)
		}
	}

	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()

	archiveInfo, err := f.Stat()
	if err != nil {
		return err
	}
	maxExtractedSize := archiveInfo.Size() * 10
	if maxExtractedSize > 10737418240 {
		maxExtractedSize = 10737418240 // 10 GB
	}

	gr, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gr.Close()

	tr := tar.NewReader(gr)

	var extractedSize int64
	var fileCount int

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		fileCount++
		if fileCount > 100000 {
			return fmt.Errorf("exceeded max file count")
		}

		if strings.Contains(header.Name, "../") || strings.HasPrefix(header.Name, "/") || strings.Contains(header.Name, ":\\") {
			return fmt.Errorf("path traversal attempt rejected: %s", header.Name)
		}

		target := filepath.Join(destDir, header.Name)
		if !strings.HasPrefix(target, filepath.Clean(destDir)+string(os.PathSeparator)) && target != filepath.Clean(destDir) {
			return fmt.Errorf("path traversal attempt rejected: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			extractedSize += header.Size
			if extractedSize > maxExtractedSize {
				return fmt.Errorf("decompression ratio or max size exceeded")
			}

			mode := os.FileMode(header.Mode) &^ (os.ModeSetuid | os.ModeSetgid | 0002)
			outFile, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR|os.O_TRUNC, mode)
			if err != nil {
				return err
			}
			
			if _, err := io.Copy(outFile, tr); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()
		case tar.TypeSymlink, tar.TypeLink:
			return fmt.Errorf("symlinks and hardlinks are rejected for security")
		default:
			return fmt.Errorf("unsupported file type: %v", header.Typeflag)
		}
	}
	return nil
}
