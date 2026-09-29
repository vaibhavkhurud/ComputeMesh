#!/bin/bash
export DATABASE_URL="postgresql://computemesh:computemesh_dev@localhost:5433/computemesh?schema=public"
cd ~/projects/ComputeMesh/packages/database
node concurrency_test.js
