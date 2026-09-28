package health

import (
	"context"
	"log"
	"time"

	"computemesh-agent/internal/client"
	"computemesh-agent/internal/discovery"
)

func StartHeartbeat(ctx context.Context, api *client.ApiClient) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := api.Heartbeat(ctx, "0.1.0"); err != nil {
				log.Printf("Heartbeat failed: %v", err)
			}
		}
	}
}

func StartCapabilities(ctx context.Context, api *client.ApiClient) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			caps := discovery.DiscoverHardware()
			if err := api.UpdateCapabilities(ctx, caps); err != nil {
				log.Printf("Capabilities update failed: %v", err)
			} else {
				log.Printf("Capabilities pushed successfully.")
			}
		}
	}
}
