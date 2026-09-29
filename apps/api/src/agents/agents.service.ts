import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';
import { AgentEnrollDto, AgentHeartbeatDto, AgentCapabilitiesDto } from './dto/agent.dto';
import * as crypto from 'crypto';
import { Logger } from '@computemesh/logger';

@Injectable()
export class AgentsService {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  async enroll(dto: AgentEnrollDto) {
    const db = getDatabaseClient();
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    return await db.$transaction(async (tx) => {
      const enrollmentToken = await tx.enrollmentToken.findUnique({
        where: { tokenHash },
      });

      if (!enrollmentToken) {
        throw new BadRequestException('Invalid or expired enrollment token');
      }

      if (enrollmentToken.usedAt) {
        throw new BadRequestException('Enrollment token has already been used');
      }

      if (enrollmentToken.expiresAt < new Date()) {
        throw new BadRequestException('Enrollment token has expired');
      }

      // Mark used
      await tx.enrollmentToken.update({
        where: { id: enrollmentToken.id },
        data: { usedAt: new Date() },
      });

      // Generate new agent secret and ID
      const agentSecret = crypto.randomBytes(32).toString('base64url');
      const credentialHash = crypto.createHash('sha256').update(agentSecret).digest('hex');

      // Create or update identity
      const identity = await tx.agentIdentity.upsert({
        where: { machineId: enrollmentToken.machineId },
        update: {
          credentialHash,
          status: 'ACTIVE',
        },
        create: {
          machineId: enrollmentToken.machineId,
          credentialHash,
          status: 'ACTIVE',
        },
      });

      this.logger.info(`Agent enrolled successfully for machine ${enrollmentToken.machineId}`);

      return {
        agentId: identity.id,
        agentSecret,
      };
    });
  }

  async heartbeat(agentId: string, dto: AgentHeartbeatDto) {
    const db = getDatabaseClient();
    const oneMinuteAgo = new Date(Date.now() - 60000);
    
    await db.agentIdentity.updateMany({
      where: { 
        id: agentId,
        OR: [
          { lastHeartbeatAt: null },
          { lastHeartbeatAt: { lt: oneMinuteAgo } }
        ]
      },
      data: {
        lastHeartbeatAt: new Date(),
        agentVersion: dto.agentVersion,
      },
    });
    return { success: true };
  }

  async updateCapabilities(machineId: string, dto: AgentCapabilitiesDto) {
    const db = getDatabaseClient();
    await db.machineDiscovery.upsert({
      where: { machineId },
      update: {
        cpuLogicalCores: dto.cpuLogicalCores,
        cpuArchitecture: dto.cpuArchitecture,
        memoryMb: dto.memoryMb,
        operatingSystem: dto.operatingSystem,
        gpuCount: dto.gpuCount,
        gpuModel: dto.gpuModel,
        gpuMemoryMb: dto.gpuMemoryMb,
        cudaVersion: dto.cudaVersion,
        discoveryStatus: dto.discoveryStatus,
        discoveryError: dto.discoveryError,
        gpuDiscoveryStatus: dto.gpuDiscoveryStatus,
        discoveredAt: new Date(),
      },
      create: {
        machineId,
        cpuLogicalCores: dto.cpuLogicalCores,
        cpuArchitecture: dto.cpuArchitecture,
        memoryMb: dto.memoryMb,
        operatingSystem: dto.operatingSystem,
        gpuCount: dto.gpuCount,
        gpuModel: dto.gpuModel,
        gpuMemoryMb: dto.gpuMemoryMb,
        cudaVersion: dto.cudaVersion,
        discoveryStatus: dto.discoveryStatus,
        discoveryError: dto.discoveryError,
        gpuDiscoveryStatus: dto.gpuDiscoveryStatus,
        discoveredAt: new Date(),
      },
    });
    return { success: true };
  }
}
