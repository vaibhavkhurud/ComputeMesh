-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('REGISTERED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('REGISTERED', 'AVAILABLE', 'BUSY', 'OFFLINE', 'DRAINING', 'DISABLED');

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'REGISTERED',
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MachineStatus" NOT NULL DEFAULT 'REGISTERED',
    "hostname" TEXT NOT NULL,
    "operatingSystem" TEXT NOT NULL,
    "architecture" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_resources" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "cpuCores" INTEGER NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "gpuCount" INTEGER NOT NULL DEFAULT 0,
    "gpuModel" TEXT,
    "gpuMemoryMb" INTEGER,
    "cudaVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_userId_key" ON "providers"("userId");

-- CreateIndex
CREATE INDEX "machines_providerId_idx" ON "machines"("providerId");

-- CreateIndex
CREATE INDEX "machines_status_idx" ON "machines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "machine_resources_machineId_key" ON "machine_resources"("machineId");

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_resources" ADD CONSTRAINT "machine_resources_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
