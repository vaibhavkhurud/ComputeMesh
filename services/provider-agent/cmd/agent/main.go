package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"time"
	"computemesh-agent/internal/client"
	"computemesh-agent/internal/config"
	"computemesh-agent/internal/discovery"
	"computemesh-agent/internal/executor"
	"computemesh-agent/internal/health"
	"computemesh-agent/internal/identity"
)

func main() {
	log.Println("Starting ComputeMesh Provider Agent M4")
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	var ident *identity.AgentIdentity

	// 1. Try to load existing identity
	ident, err = identity.Load(cfg.AgentIdPath)
	if err != nil {
		if os.IsNotExist(err) && cfg.EnrollmentToken != "" {
			log.Println("No identity found. Using enrollment token...")
			enrollRes, err := client.Enroll(context.Background(), cfg.ApiUrl, cfg.EnrollmentToken)
			if err != nil {
				log.Fatalf("Enrollment failed: %v", err)
			}
			ident = &identity.AgentIdentity{
				AgentId:     enrollRes.AgentId,
				AgentSecret: enrollRes.AgentSecret,
			}
			if err := identity.Save(cfg.AgentIdPath, ident); err != nil {
				log.Fatalf("Failed to save identity: %v", err)
			}
			log.Println("Enrollment successful. Identity saved.")
		} else {
			log.Fatalf("No identity found and no enrollment token provided.")
		}
	} else {
		log.Println("Loaded existing agent identity.")
	}

	api := client.New(cfg.ApiUrl, ident.AgentId, ident.AgentSecret)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initial capabilities push
	log.Println("Performing initial hardware discovery...")
	caps := discovery.DiscoverHardware()
	if err := api.UpdateCapabilities(ctx, caps); err != nil {
		log.Printf("Warning: initial capabilities push failed: %v", err)
	} else {
		log.Println("Initial capabilities pushed successfully.")
	}

	go health.StartHeartbeat(ctx, api)
	go health.StartCapabilities(ctx, api)

	log.Println("Starting M7 Execution Loop...")
	loop, err := executor.NewExecutionLoop(api, "/tmp/computemesh-workspaces")
	if err != nil {
		log.Printf("Failed to initialize ExecutionLoop: %v", err)
	} else {
		loop.CleanupOrphans()
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					loop.PollAndExecute(ctx)
				}
			}
		}()
	}

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	log.Println("Shutting down agent...")
	cancel()
}
