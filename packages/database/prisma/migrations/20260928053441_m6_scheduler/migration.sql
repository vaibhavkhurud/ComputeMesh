-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'RELEASED', 'REJECTED');

-- CreateTable
CREATE TABLE "job_assignments" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "schedulerScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_assignments_jobId_status_idx" ON "job_assignments"("jobId", "status");

-- CreateIndex
CREATE INDEX "job_assignments_machineId_status_idx" ON "job_assignments"("machineId", "status");

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add partial unique index for active assignments
CREATE UNIQUE INDEX "unique_active_assignment" ON "job_assignments" ("jobId") WHERE "status" = 'ACTIVE';
