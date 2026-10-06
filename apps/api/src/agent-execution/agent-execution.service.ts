import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';
import { AgentResultDto } from './dto/execution.dto';

@Injectable()
export class AgentExecutionService {
  private db = getDatabaseClient();

  constructor(@Inject('LOGGER') private readonly logger: any) {
    this.logger.info('AgentExecutionService initialized');
  }

  async getAssignments(machineId: string, providerId: string) {
    const assignments = await this.db.jobAssignment.findMany({
      where: {
        machineId,
        providerId,
        status: 'ACTIVE',
        job: { status: 'ASSIGNED' }
      },
      include: {
        job: {
          include: {
            requirement: true
          }
        }
      }
    });

    const result = [];
    for (const a of assignments) {
      // Resolve runtime to a server-controlled immutable digest.
      let img = `alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6`;
      
      let checkpointUrl = undefined;
      let checkpointChecksum = undefined;

      if (a.job.recoveryAttempts > 0 || a.job.checkpointSequence > 0) {
        const cp = await this.db.checkpoint.findFirst({
          where: { jobId: a.jobId, status: 'VERIFIED' },
          orderBy: { sequence: 'desc' }
        });
        if (cp) {
          checkpointUrl = `http://172.26.0.1:8333/${cp.bucket}/${cp.storageKey}`;
          checkpointChecksum = cp.checksumSha256;
        }
      }

      result.push({
        assignmentId: a.id,
        jobId: a.jobId,
        jobName: a.job.name,
        inputBucket: a.job.inputBucket,
        inputKey: a.job.inputKey,
        inputSize: a.job.inputSize?.toString(),
        requirements: a.job.requirement,
        trustedImage: img,
        checkpointUrl,
        checkpointChecksum
      });
    }

    return result;
  }

  async getAssignmentStatus(machineId: string, providerId: string, assignmentId: string) {
    const assignment = await this.db.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true }
    });

    if (!assignment || assignment.machineId !== machineId || assignment.providerId !== providerId) {
      throw new NotFoundException('Assignment not found');
    }

    return { status: assignment.job.status };
  }

  async startExecution(machineId: string, providerId: string, assignmentId: string) {
    const claimed = await this.db.$transaction(async (tx) => {
      // Safe lookup
      const lookup = await tx.$queryRaw<{jobId: string}[]>`SELECT "jobId" FROM "job_assignments" WHERE id = ${assignmentId}`;
      if (!lookup.length) return false;
      const jobId = lookup[0].jobId;

      // 1. Lock Job
      const jobs = await tx.$queryRaw<{status: string}[]>`SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE`;
      if (!jobs.length || jobs[0].status !== 'ASSIGNED') return false;

      // 2. Lock Assignment
      const current = await tx.$queryRaw<{jobId: string}[]>`
        SELECT "jobId" FROM "job_assignments"
        WHERE id = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "providerId" = ${providerId}
          AND status = 'ACTIVE'
        FOR UPDATE
      `;
      if (!current.length) return false;

      await tx.job.update({
        where: { id: jobId },
        data: { status: 'STARTING', updatedAt: new Date() }
      });

      await tx.$executeRaw`
        INSERT INTO "execution_leases" (
          id, "jobId", "assignmentId", "machineId", 
          "issuedAt", "expiresAt", "lastRenewedAt", 
          status, "createdAt", "updatedAt"
        )
        VALUES (
          gen_random_uuid(), ${jobId}, ${assignmentId}, ${machineId},
          NOW(), NOW() + INTERVAL '5 minutes', NOW(),
          'ACTIVE', NOW(), NOW()
        )
      `;

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'LEASE_CREATED',
          fromStatus: 'ASSIGNED',
          toStatus: 'STARTING',
          actorType: 'SYSTEM',
          actorId: machineId,
          metadata: { assignmentId, message: 'Lease created' }
        }
      });

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'STATUS_CHANGED',
          fromStatus: 'ASSIGNED',
          toStatus: 'STARTING',
          actorType: 'AGENT',
          actorId: machineId,
          metadata: { assignmentId, message: 'Agent starting execution' }
        }
      });

      return true;
    });

    if (!claimed) {
      throw new ConflictException('Assignment is not ACTIVE or Job is not ASSIGNED');
    }

    return { success: true };
  }

  async reportRunning(machineId: string, providerId: string, assignmentId: string) {
    const running = await this.db.$transaction(async (tx) => {
      // Safe lookup
      const lookup = await tx.$queryRaw<{jobId: string}[]>`SELECT "jobId" FROM "job_assignments" WHERE id = ${assignmentId}`;
      if (!lookup.length) return false;
      const jobId = lookup[0].jobId;

      // 1. Lock Job
      const jobs = await tx.$queryRaw<{status: string}[]>`SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE`;
      if (!jobs.length || jobs[0].status !== 'STARTING') return false;

      // 2. Lock Assignment
      const current = await tx.$queryRaw<{jobId: string}[]>`
        SELECT "jobId" FROM "job_assignments"
        WHERE id = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "providerId" = ${providerId}
          AND status = 'ACTIVE'
        FOR UPDATE
      `;
      if (!current.length) return false;

      // 3. Lock Lease
      const leases = await tx.$queryRaw<{status: string}[]>`
        SELECT status FROM "execution_leases" 
        WHERE "assignmentId" = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "expiresAt" > NOW() 
        FOR UPDATE
      `;
      if (!leases.length || leases[0].status !== 'ACTIVE') return false;

      await tx.job.update({
        where: { id: jobId },
        data: { status: 'RUNNING', updatedAt: new Date() }
      });

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'STATUS_CHANGED',
          fromStatus: 'STARTING',
          toStatus: 'RUNNING',
          actorType: 'AGENT',
          actorId: machineId,
          metadata: { assignmentId, message: 'Container running' }
        }
      });

      return true;
    });

    if (!running) {
      throw new ConflictException('Cannot transition to RUNNING (might be cancelled or not STARTING)');
    }

    return { success: true };
  }

  async reportResult(machineId: string, providerId: string, assignmentId: string, dto: AgentResultDto) {
    const result = await this.db.$transaction(async (tx) => {
      // Safe lookup
      const lookup = await tx.$queryRaw<{jobId: string}[]>`SELECT "jobId" FROM "job_assignments" WHERE id = ${assignmentId}`;
      if (!lookup.length) return false;
      const jobId = lookup[0].jobId;

      // 1. Lock Job
      const jobs = await tx.$queryRaw<{status: string}[]>`SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE`;
      if (!jobs.length) return false;

      // 2. Lock Assignment
      const current = await tx.$queryRaw<{jobId: string}[]>`
        SELECT "jobId" FROM "job_assignments"
        WHERE id = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "providerId" = ${providerId}
          AND status = 'ACTIVE'
        FOR UPDATE
      `;
      if (!current.length) return false;

      // 3. Lock Lease
      const leases = await tx.$queryRaw<{status: string}[]>`
        SELECT status FROM "execution_leases" 
        WHERE "assignmentId" = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "expiresAt" > NOW() 
        FOR UPDATE
      `;
      if (!leases.length || leases[0].status !== 'ACTIVE') return false;
      const jobStatus = jobs[0].status;

      // Only STARTING or RUNNING can be completed/failed by agent normally.
      // If it's CANCELLED, we still want to RELEASE the assignment, but not override job status.
      let newJobStatus = jobStatus;
      
      if (jobStatus === 'STARTING' || jobStatus === 'RUNNING') {
        newJobStatus = dto.status;
        
        await tx.job.update({
          where: { id: jobId },
          data: { 
            status: newJobStatus as any, 
            updatedAt: new Date(),
            completedAt: dto.status === 'COMPLETED' ? new Date() : null
          }
        });
        
        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: 'STATUS_CHANGED',
            fromStatus: jobStatus as any,
            toStatus: newJobStatus as any,
            actorType: 'AGENT',
            actorId: machineId,
            metadata: { 
              assignmentId, 
              outputSize: dto.outputSize, 
              failureReason: dto.failureReason 
            }
          }
        });
      }

      await tx.jobAssignment.update({
        where: { id: assignmentId },
        data: { 
          status: 'RELEASED', 
          releasedAt: new Date(),
          failureReason: dto.failureReason || null
          // output fields will be updated by S3 flow, but for now we leave them empty or they'll be patched later.
        }
      });

      return true;
    });

    if (!result) {
      throw new ConflictException('Assignment not active or missing');
    }

    return { success: true };
  }

  async renewLease(machineId: string, providerId: string, assignmentId: string) {
    // Note: execution_leases table might not have providerId, but we can verify it via subquery or just accept it's a known agent.
    // Actually, we'll verify it by making sure the assignment belongs to this provider.
    const updated = await this.db.$executeRaw`
      UPDATE "execution_leases"
      SET "expiresAt" = NOW() + INTERVAL '5 minutes',
          "lastRenewedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "assignmentId" = ${assignmentId}
        AND "machineId" = ${machineId}
        AND status = 'ACTIVE'
        AND "expiresAt" > NOW()
        AND EXISTS (SELECT 1 FROM job_assignments WHERE id = ${assignmentId} AND "providerId" = ${providerId})
    `;

    if (updated === 0) {
      throw new ConflictException('Lease is not ACTIVE or has already expired');
    }

    return { success: true };
  }
}
