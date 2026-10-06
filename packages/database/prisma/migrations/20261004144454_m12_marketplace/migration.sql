-- CreateEnum
CREATE TYPE "MarketplaceStatus" AS ENUM ('UNLISTED', 'LISTED', 'PAUSED');

-- AlterTable
ALTER TABLE "job_requirements" ADD COLUMN     "maxPriceCentsPerHour" INTEGER,
ADD COLUMN     "targetMachineId" TEXT,
ADD COLUMN     "targetProviderId" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "quotedCurrency" TEXT,
ADD COLUMN     "quotedPriceCentsPerHour" INTEGER;

-- AlterTable
ALTER TABLE "machines" ADD COLUMN     "marketplaceStatus" "MarketplaceStatus" NOT NULL DEFAULT 'UNLISTED';

-- AlterTable
ALTER TABLE "providers" ADD COLUMN     "description" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "machine_pricing" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "flatCentsPerHour" INTEGER NOT NULL DEFAULT 0,
    "cpuCentsPerHour" INTEGER NOT NULL DEFAULT 0,
    "memoryGbCentsPerHour" INTEGER NOT NULL DEFAULT 0,
    "gpuCentsPerHour" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "minBillingMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machine_pricing_machineId_key" ON "machine_pricing"("machineId");

-- CreateIndex
CREATE INDEX "machines_marketplaceStatus_status_idx" ON "machines"("marketplaceStatus", "status");

-- AddForeignKey
ALTER TABLE "machine_pricing" ADD CONSTRAINT "machine_pricing_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
