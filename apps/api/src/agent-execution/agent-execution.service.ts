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

    return assignments.map(a => {
      // Resolve runtime to a server-controlled immutable digest.
      // (Mock logic representing the trusted runtime policy).
      let digest = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      let img = `computemesh/python-runtime@${digest}`;

      return {
        assignmentId: a.id,
        jobId: a.jobId,
        jobName: a.job.name,
        inputBucket: a.job.inputBucket,
        inputKey: a.job.inputKey,
        inputSize: a.job.inputSize?.toString(),
        requirements: a.job.requirement,
        trustedImage: img
      };
    });
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
      const current = await tx.$queryRaw<{jobId: string}[]>`
        SELECT "jobId" FROM "job_assignments"
        WHERE id = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "providerId" = ${providerId}
          AND status = 'ACTIVE'
        FOR UPDATE
      `;

      if (!current.length) return false;
      const jobId = current[0].jobId;

      const jobs = await tx.$queryRaw<{status: string}[]>`
        SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE
      `;

      if (!jobs.length || jobs[0].status !== 'ASSIGNED') return false;

      await tx.job.update({
        where: { id: jobId },
        data: { status: 'STARTING', updatedAt: new Date() }
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
      const current = await tx.$queryRaw<{jobId: string}[]>`
        SELECT "jobId" FROM "job_assignments"
        WHERE id = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "providerId" = ${providerId}
          AND status = 'ACTIVE'
        FOR UPDATE
      `;

      if (!current.length) return false;
      const jobId = current[0].jobId;

      const jobs = await tx.$queryRaw<{status: string}[]>`
        SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE
      `;

      if (!jobs.length || jobs[0].status !== 'STARTING') return false;

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
      const current = await tx.$queryRaw<{jobId: string}[]>`
        SELECT "jobId" FROM "job_assignments"
        WHERE id = ${assignmentId} 
          AND "machineId" = ${machineId} 
          AND "providerId" = ${providerId}
          AND status = 'ACTIVE'
        FOR UPDATE
      `;

      if (!current.length) return false;
      const jobId = current[0].jobId;

      const jobs = await tx.$queryRaw<{status: string}[]>`
        SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE
      `;

      if (!jobs.length) return false;
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
}
