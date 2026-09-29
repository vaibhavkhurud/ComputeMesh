#!/bin/bash
ADMIN_EMAIL=$(cat ~/projects/ComputeMesh/admin-email.txt)
docker exec -i computemesh-postgres psql -U computemesh -d computemesh -c "UPDATE \"users\" SET role = 'ADMIN' WHERE email = '${ADMIN_EMAIL}';"
