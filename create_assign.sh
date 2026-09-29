#!/bin/bash
export DATABASE_URL="postgresql://computemesh:computemesh_dev@localhost:5433/computemesh?schema=public"
cd ~/projects/ComputeMesh
node create_job.js > job.out
JOB_ID=$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' job.out | head -n 1)
export JOB_ID
cp /mnt/d/ComputeMesh/assign_job.js packages/database/assign_job.js
sed -i "s/'b5efcf34-1d81-45c0-97f7-3f11dd6a7397'/process.env.JOB_ID/g" packages/database/assign_job.js
cd packages/database
node assign_job.js
