-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CheckpointStatus" AS ENUM ('CREATING', 'UPLOADED', 'VERIFYING', 'VERIFIED', 'FAILED', 'DELETED');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "checkpointSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "execution_leases" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LeaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "executionLeaseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "CheckpointStatus" NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "failureReason" TEXT,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "execution_leases_assignmentId_key" ON "execution_leases"("assignmentId");

-- CreateIndex
CREATE INDEX "execution_leases_jobId_idx" ON "execution_leases"("jobId");

-- CreateIndex
CREATE INDEX "execution_leases_expiresAt_idx" ON "execution_leases"("expiresAt");

-- CreateIndex
CREATE INDEX "checkpoints_jobId_status_sequence_idx" ON "checkpoints"("jobId", "status", "sequence" DESC);

-- CreateIndex
CREATE INDEX "checkpoints_assignmentId_idx" ON "checkpoints"("assignmentId");

-- CreateIndex
CREATE INDEX "checkpoints_executionLeaseId_idx" ON "checkpoints"("executionLeaseId");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_jobId_sequence_key" ON "checkpoints"("jobId", "sequence");

-- AddForeignKey
ALTER TABLE "execution_leases" ADD CONSTRAINT "execution_leases_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_leases" ADD CONSTRAINT "execution_leases_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "job_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_leases" ADD CONSTRAINT "execution_leases_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "job_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_executionLeaseId_fkey" FOREIGN KEY ("executionLeaseId") REFERENCES "execution_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
