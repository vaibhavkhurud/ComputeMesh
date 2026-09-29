#!/bin/bash
export COMPUTEMESH_API_URL=http://localhost:3001
export COMPUTEMESH_ENROLLMENT_TOKEN=$(cat ~/projects/ComputeMesh/test-enrollment-token.txt)
cd ~/projects/ComputeMesh/services/provider-agent
./agent
