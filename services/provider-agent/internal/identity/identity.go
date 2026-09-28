package identity

import (
	"encoding/json"
	"os"
)

type AgentIdentity struct {
	AgentId     string `json:"agentId"`
	AgentSecret string `json:"agentSecret"`
}

func Load(path string) (*AgentIdentity, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var ident AgentIdentity
	if err := json.Unmarshal(data, &ident); err != nil {
		return nil, err
	}
	return &ident, nil
}

func Save(path string, ident *AgentIdentity) error {
	data, err := json.Marshal(ident)
	if err != nil {
		return err
	}

	// 0600 permissions
	return os.WriteFile(path, data, 0600)
}
