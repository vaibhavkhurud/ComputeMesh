-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('CREATED', 'QUEUED', 'SCHEDULING', 'ASSIGNED', 'LEASED', 'STARTING', 'RUNNING', 'CHECKPOINTING', 'INTERRUPTED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventActorType" AS ENUM ('USER', 'SYSTEM', 'AGENT', 'ADMIN');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'CREATED',
    "inputBucket" TEXT,
    "inputKey" TEXT,
    "inputSize" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "queuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requirements" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "cpuCoresMin" INTEGER,
    "memoryMbMin" INTEGER,
    "gpuRequired" BOOLEAN NOT NULL DEFAULT false,
    "gpuCount" INTEGER,
    "gpuModel" TEXT,
    "gpuMemoryMbMin" INTEGER,
    "cudaVersion" TEXT,
    "architecture" TEXT,
    "operatingSystem" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "actorType" "EventActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_userId_idx" ON "jobs"("userId");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_createdAt_idx" ON "jobs"("createdAt");

-- CreateIndex
CREATE INDEX "jobs_userId_status_createdAt_idx" ON "jobs"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_requirements_jobId_key" ON "job_requirements"("jobId");

-- CreateIndex
CREATE INDEX "job_events_jobId_createdAt_idx" ON "job_events"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
