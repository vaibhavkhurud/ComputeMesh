package config

import (
	"os"
)

type Config struct {
	ApiUrl          string
	EnrollmentToken string
	AgentIdPath     string
}

func LoadConfig() (*Config, error) {
	apiUrl := os.Getenv("COMPUTEMESH_API_URL")
	if apiUrl == "" {
		apiUrl = "http://localhost:3001"
	}

	token := os.Getenv("COMPUTEMESH_ENROLLMENT_TOKEN")

	agentIdPath := os.Getenv("COMPUTEMESH_AGENT_ID_PATH")
	if agentIdPath == "" {
		agentIdPath = "agent-credentials.json"
	}

	return &Config{
		ApiUrl:          apiUrl,
		EnrollmentToken: token,
		AgentIdPath:     agentIdPath,
	}, nil
}
