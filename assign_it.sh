#!/bin/bash
export DATABASE_URL="postgresql://computemesh:computemesh_dev@localhost:5433/computemesh?schema=public"
cp /mnt/d/ComputeMesh/assign_job.js ~/projects/ComputeMesh/packages/database/assign_job.js
cd ~/projects/ComputeMesh/packages/database
node assign_job.js
