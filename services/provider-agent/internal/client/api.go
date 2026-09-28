package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type ApiClient struct {
	BaseUrl     string
	AgentId     string
	AgentSecret string
	HttpClient  *http.Client
}

func New(baseUrl, agentId, agentSecret string) *ApiClient {
	return &ApiClient{
		BaseUrl:     baseUrl,
		AgentId:     agentId,
		AgentSecret: agentSecret,
		HttpClient:  &http.Client{Timeout: 10 * time.Second},
	}
}

type EnrollRequest struct {
	Token string `json:"token"`
}

type EnrollResponse struct {
	AgentId     string `json:"agentId"`
	AgentSecret string `json:"agentSecret"`
}

func Enroll(ctx context.Context, baseUrl, token string) (*EnrollResponse, error) {
	reqBody, _ := json.Marshal(EnrollRequest{Token: token})
	req, err := http.NewRequestWithContext(ctx, "POST", baseUrl+"/agents/enroll", bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 201 {
		return nil, fmt.Errorf("enroll failed with status %d", resp.StatusCode)
	}

	var res EnrollResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *ApiClient) Heartbeat(ctx context.Context, version string) error {
	body, _ := json.Marshal(map[string]string{"agentVersion": version})
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseUrl+"/agents/heartbeat", bytes.NewBuffer(body))
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
		return fmt.Errorf("heartbeat failed with status %d", resp.StatusCode)
	}
	return nil
}

func (c *ApiClient) UpdateCapabilities(ctx context.Context, caps interface{}) error {
	body, _ := json.Marshal(caps)
	req, err := http.NewRequestWithContext(ctx, "PUT", c.BaseUrl+"/agents/capabilities", bytes.NewBuffer(body))
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

	if resp.StatusCode != 200 {
		return fmt.Errorf("update capabilities failed with status %d", resp.StatusCode)
	}
	return nil
}
