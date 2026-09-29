#!/bin/bash
export DATABASE_URL="postgresql://computemesh:computemesh_dev@localhost:5433/computemesh?schema=public"
cd ~/projects/ComputeMesh/packages/database
./node_modules/.bin/prisma migrate reset --force
./node_modules/.bin/prisma migrate dev --name m8_execution_leases
