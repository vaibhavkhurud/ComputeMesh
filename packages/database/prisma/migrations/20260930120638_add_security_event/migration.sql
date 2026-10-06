-- CreateEnum
CREATE TYPE "SecurityActorType" AS ENUM ('USER', 'AGENT', 'ADMIN', 'SYSTEM', 'ANONYMOUS');

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" "SecurityActorType" NOT NULL,
    "actorId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_type_createdAt_idx" ON "security_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_actorId_createdAt_idx" ON "security_events"("actorId", "createdAt");
