import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';
import { RegisterProviderDto, UpdateProviderDto, CreateMachineDto, UpdateMachineDto } from './dto/provider.dto';
import { Logger } from '@computemesh/logger';

@Injectable()
export class ProvidersService {
  private db = getDatabaseClient();

  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  async registerProvider(userId: string, dto: RegisterProviderDto) {
    const existing = await this.db.provider.findUnique({ where: { userId } });
    if (existing) {
      throw new BadRequestException('User already has a provider profile');
    }

    const provider = await this.db.provider.create({
      data: {
        userId,
        displayName: dto.displayName,
        status: 'REGISTERED',
      },
    });

    this.logger.info(`Provider profile created for user ${userId}`);
    return provider;
  }

  async getMyProvider(userId: string) {
    const provider = await this.db.provider.findUnique({
      where: { userId },
      include: { machines: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider profile not found');
    }
    return provider;
  }

  async updateMyProvider(userId: string, dto: UpdateProviderDto) {
    const provider = await this.getMyProvider(userId);
    
    return this.db.provider.update({
      where: { id: provider.id },
      data: { displayName: dto.displayName },
    });
  }

  async createMachine(userId: string, dto: CreateMachineDto) {
    const provider = await this.getMyProvider(userId);

    const machine = await this.db.machine.create({
      data: {
        providerId: provider.id,
        name: dto.name,
        hostname: dto.hostname,
        operatingSystem: dto.operatingSystem,
        architecture: dto.architecture,
        region: dto.region,
        status: 'REGISTERED',
        resource: {
          create: {
            cpuCores: dto.resources.cpuCores,
            memoryMb: dto.resources.memoryMb,
            storageGb: dto.resources.storageGb,
            gpuCount: dto.resources.gpuCount,
            gpuModel: dto.resources.gpuModel,
            gpuMemoryMb: dto.resources.gpuMemoryMb,
            cudaVersion: dto.resources.cudaVersion,
          }
        }
      },
      include: { resource: true },
    });

    this.logger.info(`Machine ${machine.id} declared by provider ${provider.id}`);
    return machine;
  }

  async getMyMachines(userId: string) {
    const provider = await this.getMyProvider(userId);
    return this.db.machine.findMany({
      where: { providerId: provider.id },
      include: { resource: true },
    });
  }

  async getMachine(userId: string, machineId: string) {
    const machine = await this.db.machine.findFirst({
      where: { 
        id: machineId,
        provider: { userId }
      },
      include: { resource: true },
    });

    if (!machine) {
      throw new NotFoundException('Machine not found or access denied');
    }
    return machine;
  }

  async updateMachine(userId: string, machineId: string, dto: UpdateMachineDto) {
    // Explicitly verify ownership
    const machine = await this.getMachine(userId, machineId);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.hostname !== undefined) updateData.hostname = dto.hostname;
    if (dto.operatingSystem !== undefined) updateData.operatingSystem = dto.operatingSystem;
    if (dto.architecture !== undefined) updateData.architecture = dto.architecture;
    if (dto.region !== undefined) updateData.region = dto.region;
    
    if (dto.resources) {
      updateData.resource = {
        update: {
          cpuCores: dto.resources.cpuCores,
          memoryMb: dto.resources.memoryMb,
          storageGb: dto.resources.storageGb,
          gpuCount: dto.resources.gpuCount,
          gpuModel: dto.resources.gpuModel,
          gpuMemoryMb: dto.resources.gpuMemoryMb,
          cudaVersion: dto.resources.cudaVersion,
        }
      };
    }

    const updated = await this.db.machine.update({
      where: { id: machine.id },
      data: updateData,
      include: { resource: true },
    });

    this.logger.info(`Machine ${machine.id} updated by provider ${machine.providerId}`);
    return updated;
  }

  async disableMachine(userId: string, machineId: string) {
    // Enforce ownership
    const machine = await this.getMachine(userId, machineId);

    const updated = await this.db.machine.update({
      where: { id: machine.id },
      data: { status: 'DISABLED' },
    });

    this.logger.info(`Machine ${machine.id} disabled by provider ${machine.providerId}`);
    return updated;
  }

  async generateEnrollmentToken(userId: string, machineId: string) {
    const machine = await this.getMachine(userId, machineId);

    const activeAgent = await this.db.agentIdentity.findFirst({
      where: { machineId: machine.id, status: 'ACTIVE' },
    });

    if (activeAgent) {
      throw new BadRequestException('An active agent already exists for this machine. Revoke it first.');
    }

    // Invalidate existing unused tokens
    await this.db.enrollmentToken.deleteMany({
      where: { machineId: machine.id },
    });

    const crypto = require('crypto');
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await this.db.enrollmentToken.create({
      data: {
        machineId: machine.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    this.logger.info(`Generated new enrollment token for machine ${machine.id}`);
    
    // The raw token is returned EXACTLY ONCE.
    return { token: rawToken };
  }

  async revokeAgent(userId: string, machineId: string) {
    const machine = await this.getMachine(userId, machineId);

    const activeAgent = await this.db.agentIdentity.findFirst({
      where: { machineId: machine.id, status: 'ACTIVE' },
    });

    if (!activeAgent) {
      throw new BadRequestException('No active agent found for this machine');
    }

    await this.db.agentIdentity.update({
      where: { id: activeAgent.id },
      data: { status: 'REVOKED' },
    });

    this.logger.info(`Agent ${activeAgent.id} for machine ${machine.id} revoked.`);
    return { success: true };
  }
}
