package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"computemesh-agent/internal/executor"
)

func (c *ApiClient) GetAssignments(ctx context.Context) ([]executor.Assignment, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseUrl+"/agent/assignments", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-ComputeMesh-Agent-ID", c.AgentId)
	req.Header.Set("Authorization", "Bearer "+c.AgentSecret)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to get assignments: %d", resp.StatusCode)
	}

	var assignments []executor.Assignment
	if err := json.NewDecoder(resp.Body).Decode(&assignments); err != nil {
		return nil, err
	}
	return assignments, nil
}

func (c *ApiClient) StartExecution(ctx context.Context, assignmentId string) error {
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseUrl+"/agent/assignments/"+assignmentId+"/start", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-ComputeMesh-Agent-ID", c.AgentId)
	req.Header.Set("Authorization", "Bearer "+c.AgentSecret)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("start execution failed: %d - %s", resp.StatusCode, string(b))
	}
	return nil
}

func (c *ApiClient) ReportRunning(ctx context.Context, assignmentId string) error {
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseUrl+"/agent/assignments/"+assignmentId+"/running", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-ComputeMesh-Agent-ID", c.AgentId)
	req.Header.Set("Authorization", "Bearer "+c.AgentSecret)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("report running failed: %d - %s", resp.StatusCode, string(b))
	}
	return nil
}

func (c *ApiClient) ReportResult(ctx context.Context, assignmentId string, status string, failureReason string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"status":        status,
		"failureReason": failureReason,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseUrl+"/agent/assignments/"+assignmentId+"/result", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ComputeMesh-Agent-ID", c.AgentId)
	req.Header.Set("Authorization", "Bearer "+c.AgentSecret)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("report result failed: %d - %s", resp.StatusCode, string(b))
	}
	return nil
}

func (c *ApiClient) GetStatus(ctx context.Context, assignmentId string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseUrl+"/agent/assignments/"+assignmentId+"/status", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-ComputeMesh-Agent-ID", c.AgentId)
	req.Header.Set("Authorization", "Bearer "+c.AgentSecret)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("get status failed: %d", resp.StatusCode)
	}
	
	var res struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	return res.Status, nil
}

func (c *ApiClient) CreateCheckpointIntent(ctx context.Context, jobId string, size int64, hash string) (*executor.IntentResponse, error) {
	body, _ := json.Marshal(map[string]interface{}{"sizeBytes": size, "checksumSha256": hash})
	req, _ := http.NewRequestWithContext(ctx, "POST", c.BaseUrl+"/agent/jobs/"+jobId+"/checkpoints/intent", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ComputeMesh-Agent-ID", c.AgentId)
	req.Header.Set("Authorization", "Bearer "+c.AgentSecret)
	resp, err := c.HttpClient.Do(req)
	if err != nil { return nil, err }
	defer resp.Body.Close()
	if resp.StatusCode != 200 && resp.StatusCode != 201 { return nil, fmt.Errorf("intent failed: %d", resp.StatusCode) }
	var res executor.IntentResponse
	json.NewDecoder(resp.Body).Decode(&res)
	return &res, nil
}

func (c *ApiClient) CompleteCheckpoint(ctx context.Context, jobId, checkpointId string) error {
	req, _ := http.NewRequestWithContext(ctx, "POST", c.BaseUrl+"/agent/jobs/"+jobId+"/checkpoints/"+checkpointId+"/complete", nil)
	req.Header.Set("X-ComputeMesh-Agent-ID", c.AgentId)
	req.Header.Set("Authorization", "Bearer "+c.AgentSecret)
	resp, err := c.HttpClient.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()
	if resp.StatusCode != 200 && resp.StatusCode != 201 { return fmt.Errorf("complete failed: %d", resp.StatusCode) }
	return nil
}

func (c *ApiClient) FailCheckpoint(ctx context.Context, jobId, checkpointId, reason string) error {
	return nil
}

