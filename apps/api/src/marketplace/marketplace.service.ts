import { Injectable } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';

@Injectable()
export class MarketplaceService {
  private db = getDatabaseClient();

  async searchMachines(query: any) {
    const {
      cpuMin,
      ramMin,
      gpuRequired,
      gpuModel,
      gpuVramMin,
      cudaVersion,
      architecture,
      operatingSystem,
      region,
      maxPriceCentsPerHour,
      availableNow,
      limit = 20,
      cursor,
    } = query;

    const take = Math.min(parseInt(limit.toString(), 10) || 20, 100);

    const where: any = {
      marketplaceStatus: 'LISTED',
    };

    // availableNow=true → only AVAILABLE machines; default includes AVAILABLE and BUSY
    if (availableNow === 'true') {
      where.status = 'AVAILABLE';
    } else {
      where.status = { in: ['AVAILABLE', 'BUSY'] };
    }

    if (region) {
      where.region = region;
    }

    const discoveryWhere: any = {};

    // minimum CPU cores
    if (cpuMin) discoveryWhere.cpuLogicalCores = { gte: parseInt(cpuMin, 10) };

    // minimum RAM (MB)
    if (ramMin) discoveryWhere.memoryMb = { gte: parseInt(ramMin, 10) };

    // GPU required — must have verified GPU
    if (gpuRequired === 'true') {
      discoveryWhere.gpuCount = { gt: 0 };
      discoveryWhere.gpuDiscoveryStatus = 'SUCCESS';
    }

    // GPU model (partial match)
    if (gpuModel) {
      discoveryWhere.gpuModel = { contains: gpuModel, mode: 'insensitive' };
    }

    // minimum GPU VRAM (MB)
    if (gpuVramMin) {
      discoveryWhere.gpuMemoryMb = { gte: parseInt(gpuVramMin, 10) };
    }

    // CUDA version (exact match)
    if (cudaVersion) {
      discoveryWhere.cudaVersion = cudaVersion;
    }

    // CPU architecture (case-insensitive)
    if (architecture) {
      discoveryWhere.cpuArchitecture = { contains: architecture, mode: 'insensitive' };
    }

    // operating system (partial match)
    if (operatingSystem) {
      discoveryWhere.operatingSystem = { contains: operatingSystem, mode: 'insensitive' };
    }

    if (Object.keys(discoveryWhere).length > 0) {
      where.discovery = discoveryWhere;
    }

    // maximum price ceiling — filter on flatCentsPerHour as proxy
    // Backend is authoritative; UI passes integer cents only
    if (maxPriceCentsPerHour) {
      const maxCents = parseInt(maxPriceCentsPerHour, 10);
      if (!isNaN(maxCents)) {
        where.pricing = {
          flatCentsPerHour: { lte: maxCents },
        };
      }
    }

    const findArgs: any = {
      where,
      take,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        region: true,
        discovery: {
          select: {
            cpuLogicalCores: true,
            memoryMb: true,
            gpuCount: true,
            gpuModel: true,
            gpuMemoryMb: true,
            cudaVersion: true,
            operatingSystem: true,
            cpuArchitecture: true,
          },
        },
        pricing: true,
        // Expose only safe public fields — no agent credentials, tokens, hashes, or internal IPs
        provider: {
          select: {
            id: true,
            displayName: true,
            description: true,
            website: true,
          },
        },
      },
    };

    if (cursor) {
      findArgs.cursor = { id: cursor };
      findArgs.skip = 1; // skip the cursor row itself
    }

    const machines = await this.db.machine.findMany(findArgs);

    return {
      data: machines.map(m => ({
        ...m,
        availableNow: m.status === 'AVAILABLE',
      })),
      nextCursor: machines.length === take ? machines[machines.length - 1].id : null,
    };
  }
}
