#!/bin/bash
export DATABASE_URL="postgresql://computemesh:computemesh_dev@localhost:5433/computemesh?schema=public"
psql "$DATABASE_URL" -c "UPDATE users SET role='PROVIDER' WHERE email='test@example.com';"
node setup_test.js
