.PHONY: build run test clean

BINARY_NAME=computemesh-agent

build:
	go build -o bin/$(BINARY_NAME) ./cmd/agent

run:
	go run ./cmd/agent

test:
	go test ./... -v

clean:
	rm -rf bin/
