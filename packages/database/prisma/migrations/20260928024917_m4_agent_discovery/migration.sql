-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "DiscoveryStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "enrollment_tokens" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_identities" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "agentVersion" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_discoveries" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "cpuLogicalCores" INTEGER,
    "cpuArchitecture" TEXT,
    "memoryMb" INTEGER,
    "operatingSystem" TEXT,
    "gpuCount" INTEGER,
    "gpuModel" TEXT,
    "gpuMemoryMb" INTEGER,
    "cudaVersion" TEXT,
    "discoveryStatus" "DiscoveryStatus" NOT NULL DEFAULT 'SUCCESS',
    "discoveryError" TEXT,
    "gpuDiscoveryStatus" "DiscoveryStatus" NOT NULL DEFAULT 'SUCCESS',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_tokens_machineId_key" ON "enrollment_tokens"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_tokens_tokenHash_key" ON "enrollment_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "agent_identities_machineId_key" ON "agent_identities"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "machine_discoveries_machineId_key" ON "machine_discoveries"("machineId");

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_identities" ADD CONSTRAINT "agent_identities_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_discoveries" ADD CONSTRAINT "machine_discoveries_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
