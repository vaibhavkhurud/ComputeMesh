import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';
import * as crypto from 'crypto';

@Injectable()
export class CheckpointsService {
  
  private prisma = getDatabaseClient();

  async createIntent(jobId: string, machineId: string, sizeBytes: number, checksumSha256: string) {
    if (sizeBytes > 5368709120) {
      throw new HttpException('Size exceeds 5GB limit', HttpStatus.BAD_REQUEST);
    }

    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { assignments: { where: { machineId, status: 'ACTIVE' } } } });
    if (!job) throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    if (job.assignments.length === 0) throw new HttpException('Unauthorized assignment', HttpStatus.FORBIDDEN);

    const assignment = job.assignments[0];
    const lease = await this.prisma.executionLease.findUnique({ where: { assignmentId: assignment.id } });
    if (!lease || lease.status !== 'ACTIVE' || lease.expiresAt < new Date()) {
      throw new HttpException('Invalid or expired lease', HttpStatus.CONFLICT);
    }

    return this.prisma.$transaction(async (tx: any) => {
      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: { checkpointSequence: { increment: 1 } },
      });

      const sequence = updatedJob.checkpointSequence;
      const checkpointId = crypto.randomUUID();
      const storageKey = `checkpoints/${job.userId}/${jobId}/${checkpointId}.tar.gz`;

      const checkpoint = await tx.checkpoint.create({
        data: {
          id: checkpointId,
          jobId,
          assignmentId: assignment.id,
          executionLeaseId: lease.id,
          sequence,
          status: 'CREATING',
          bucket: 'computemesh-checkpoints',
          storageKey,
          sizeBytes,
          checksumSha256
        }
      });

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'CHECKPOINT_STARTED',
          toStatus: job.status,
          actorType: 'AGENT',
          actorId: machineId,
          metadata: { checkpointId, sequence }
        }
      });

      // Generate Presigned POST URL here (mocked for SeaweedFS)
      const uploadUrl = `http://localhost:8333/computemesh-checkpoints/${storageKey}?presigned=true`;
      
      return { 
        checkpoint: {
          ...checkpoint,
          sizeBytes: checkpoint.sizeBytes.toString(),
          sequence: checkpoint.sequence.toString()
        }, 
        uploadUrl 
      };
    });
  }

  async completeUpload(jobId: string, checkpointId: string, machineId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      // 1. Fetch checkpoint
      const checkpoint = await tx.checkpoint.findUnique({ where: { id: checkpointId } });
      if (!checkpoint || checkpoint.jobId !== jobId) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
      
      // 2. Lock lease FOR UPDATE
      const leases = await tx.$queryRaw`SELECT * FROM execution_leases WHERE id = ${checkpoint.executionLeaseId} FOR UPDATE`;
      if (!leases || (leases as any[]).length === 0) {
        throw new HttpException('Lease not found', HttpStatus.NOT_FOUND);
      }
      
      const lease = (leases as any[])[0];
      if (lease.status !== 'ACTIVE' || new Date(lease.expiresAt) < new Date()) {
        await tx.checkpoint.update({ where: { id: checkpointId }, data: { status: 'FAILED', failureReason: 'Lease expired' } });
        throw new HttpException('Lease expired', HttpStatus.CONFLICT);
      }
      
      await tx.checkpoint.update({ where: { id: checkpointId }, data: { status: 'VERIFIED', verifiedAt: new Date() } });
      
      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'CHECKPOINT_VERIFIED',
          toStatus: 'RUNNING',
          actorType: 'AGENT',
          actorId: machineId,
          metadata: { checkpointId }
        }
      });
      
      return { success: true };
    });
  }

  async failUpload(jobId: string, checkpointId: string, reason: string) {
    const cp = await this.prisma.checkpoint.findUnique({ where: { id: checkpointId } });
    if (!cp || cp.jobId !== jobId) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    await this.prisma.checkpoint.update({
      where: { id: checkpointId },
      data: { status: 'FAILED', failureReason: reason }
    });
    return { success: true };
  }

  async listCheckpoints(jobId: string, userId: string): Promise<any> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId, userId } });
    if (!job) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    const cps = await this.prisma.checkpoint.findMany({ where: { jobId }, orderBy: { sequence: 'desc' } });
    return cps.map((cp: any) => ({
      ...cp,
      sizeBytes: cp.sizeBytes.toString(),
      sequence: cp.sequence.toString()
    }));
  }
}
