CREATE UNIQUE INDEX "idx_active_lease_per_job" ON "execution_leases" ("jobId") WHERE "status" = 'ACTIVE';
