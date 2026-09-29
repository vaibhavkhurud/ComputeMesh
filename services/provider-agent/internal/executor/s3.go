package executor

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
)

type StorageClient interface {
	Download(ctx context.Context, bucket, key, destPath string) error
	Upload(ctx context.Context, bucket, key, srcPath string) error
}

type SeaweedStorageClient struct {
	Endpoint string
}

func NewSeaweedStorageClient(endpoint string) *SeaweedStorageClient {
	if endpoint == "" {
		endpoint = "http://localhost:8333" // Default SeaweedFS S3 port
	}
	return &SeaweedStorageClient{Endpoint: endpoint}
}

func (s *SeaweedStorageClient) Download(ctx context.Context, bucket, key, destPath string) error {
	url := fmt.Sprintf("%s/%s/%s", s.Endpoint, bucket, key)
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
		return fmt.Errorf("failed to download %s/%s: status %d", bucket, key, resp.StatusCode)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func (s *SeaweedStorageClient) Upload(ctx context.Context, bucket, key, srcPath string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Nothing to upload
		}
		return err
	}
	defer f.Close()

	url := fmt.Sprintf("%s/%s/%s", s.Endpoint, bucket, key)
	req, err := http.NewRequestWithContext(ctx, "PUT", url, f)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return fmt.Errorf("failed to upload %s/%s: status %d", bucket, key, resp.StatusCode)
	}
	return nil
}
