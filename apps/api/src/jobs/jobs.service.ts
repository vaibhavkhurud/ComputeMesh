import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';
import { Logger } from '@computemesh/logger';
import { CreateJobDto } from './dto/job.dto';
import { JobLifecycleService } from './job-lifecycle.service';

@Injectable()
export class JobsService {
  private db = getDatabaseClient();

  constructor(
    @Inject('LOGGER') private readonly logger: Logger,
    private readonly lifecycle: JobLifecycleService,
  ) {}

  private mapJobResponse(job: any) {
    if (!job) return null;
    return {
      ...job,
      inputSize: job.inputSize !== null && job.inputSize !== undefined ? job.inputSize.toString() : null,
    };
  }

  async createJob(userId: string, dto: CreateJobDto) {
    // Determine gpuRequired logically
    const reqs = dto.requirements;
    let gpuRequired = false;
    if (reqs && (reqs.gpuCount !== undefined || reqs.gpuModel || reqs.gpuMemoryMbMin !== undefined || reqs.cudaVersion)) {
      gpuRequired = true;
    }

    this.lifecycle.assertTransition(null, 'CREATED');
    this.lifecycle.assertTransition('CREATED', 'QUEUED');

    // Secure object storage bucket
    const inputBucket = 'computemesh-jobs'; // Server controlled
    let inputKey = dto.inputKey;
    if (inputKey) {
      // Prevent absolute or traversal explicitly again just to be safe
      const sanitized = inputKey.replace(/\.\./g, '').replace(/^\/+/, '');
      inputKey = `users/${userId}/jobs/{JOB_ID}/${sanitized}`; // We will replace {JOB_ID} during creation if possible, or just generate a uuid for it first.
    }

    const jobId = crypto.randomUUID();
    if (inputKey) {
      inputKey = inputKey.replace('{JOB_ID}', jobId);
    }

    let quotedPriceCentsPerHour = null;
    let quotedCurrency = null;

    if (dto.requirements?.targetMachineId) {
      const targetMachine = await this.db.machine.findUnique({
        where: { id: dto.requirements.targetMachineId },
        include: { pricing: true, discovery: true }
      });
      if (targetMachine && targetMachine.pricing) {
        const p = targetMachine.pricing;
        const d = targetMachine.discovery;
        const cpuCores = d?.cpuLogicalCores || 0;
        const memoryGb = Math.ceil((d?.memoryMb || 0) / 1024);
        const gpuCount = d?.gpuCount || 0;
        
        const componentPrice = (p.cpuCentsPerHour * cpuCores) + (p.memoryGbCentsPerHour * memoryGb) + (p.gpuCentsPerHour * gpuCount);
        quotedPriceCentsPerHour = Math.max(p.flatCentsPerHour, componentPrice);
        quotedCurrency = p.currency;
      }
    }

    return await this.db.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          id: jobId,
          userId,
          name: dto.name,
          status: 'QUEUED', // Transition directly to QUEUED after CREATED conceptually
          inputBucket,
          inputKey,
          inputSize: dto.inputSize !== undefined ? BigInt(dto.inputSize) : null,
          quotedPriceCentsPerHour,
          quotedCurrency,
          queuedAt: new Date(),
          
          requirement: dto.requirements ? {
            create: {
              cpuCoresMin: dto.requirements.cpuCoresMin,
              memoryMbMin: dto.requirements.memoryMbMin,
              gpuRequired,
              gpuCount: dto.requirements.gpuCount,
              gpuModel: dto.requirements.gpuModel,
              gpuMemoryMbMin: dto.requirements.gpuMemoryMbMin,
              cudaVersion: dto.requirements.cudaVersion,
              architecture: dto.requirements.architecture,
              operatingSystem: dto.requirements.operatingSystem,
              region: dto.requirements.region,
              targetMachineId: dto.requirements.targetMachineId,
              maxPriceCentsPerHour: dto.requirements.maxPriceCentsPerHour,
            }
          } : undefined,

          events: {
            create: [
              {
                eventType: 'CREATED',
                toStatus: 'CREATED',
                actorType: 'USER',
                actorId: userId,
                metadata: { message: 'Job created' },
              },
              {
                eventType: 'STATUS_CHANGED',
                fromStatus: 'CREATED',
                toStatus: 'QUEUED',
                actorType: 'SYSTEM',
                actorId: 'system',
                metadata: { message: 'Job automatically queued' },
              }
            ]
          }
        },
        include: { requirement: true },
      });

      this.logger.info(`Job ${job.id} created and queued by user ${userId}`);
      return this.mapJobResponse(job);
    });
  }

  async getJobs(userId: string | null, isAdmin: boolean, page: number = 1, limit: number = 20, status?: string) {
    const where: any = {};
    if (!isAdmin) {
      if (!userId) throw new ForbiddenException();
      where.userId = userId;
    }
    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;
    const [total, jobs] = await Promise.all([
      this.db.job.count({ where }),
      this.db.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    ]);

    return {
      data: jobs.map(j => this.mapJobResponse(j)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  async getJob(userId: string | null, isAdmin: boolean, jobId: string) {
    const where: any = { id: jobId };
    if (!isAdmin) {
      if (!userId) throw new ForbiddenException();
      where.userId = userId;
    }

    const job = await this.db.job.findFirst({
      where,
      include: { requirement: true }
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return this.mapJobResponse(job);
  }

  async cancelJob(userId: string, jobId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, userId }
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Rough check before transacting
    this.lifecycle.assertTransition(job.status, 'CANCELLED');

    await this.db.$transaction(async (tx) => {
      // 1. Authoritative lock and read
      const currentJobs = await tx.$queryRaw<{status: string}[]>`
        SELECT status FROM jobs WHERE id = ${jobId} AND "userId" = ${userId} FOR UPDATE
      `;
      
      if (!currentJobs.length) {
        throw new NotFoundException('Job not found');
      }
      
      const currentStatus = currentJobs[0].status as import('@computemesh/database').JobStatus;
      
      // 2. Validate transition
      if (!this.lifecycle.canTransition(currentStatus, 'CANCELLED')) {
        throw new BadRequestException('Job could not be cancelled. It may have already transitioned.');
      }

      // 3. Update job status
      await tx.job.update({
        where: { id: jobId },
        data: { 
          status: 'CANCELLED', 
          cancelledAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Branch based on currentStatus for atomic revocation
      if (currentStatus === 'ASSIGNED') {
        await tx.$executeRaw`
          UPDATE "job_assignments"
          SET status = 'RELEASED', "releasedAt" = NOW(), "updatedAt" = NOW()
          WHERE "jobId" = ${jobId} AND status = 'ACTIVE'
        `;
      } else if (currentStatus === 'STARTING' || currentStatus === 'RUNNING') {
        await tx.$executeRaw`
          UPDATE "job_assignments"
          SET status = 'RELEASED', "releasedAt" = NOW(), "updatedAt" = NOW()
          WHERE "jobId" = ${jobId} AND status = 'ACTIVE'
        `;
        await tx.$executeRaw`
          UPDATE "execution_leases"
          SET status = 'REVOKED', "updatedAt" = NOW()
          WHERE "jobId" = ${jobId} AND status = 'ACTIVE'
        `;
      }

      // 4. Create event
      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'STATUS_CHANGED',
          fromStatus: currentStatus,
          toStatus: 'CANCELLED',
          actorType: 'USER',
          actorId: userId,
          metadata: { message: 'Cancelled by user' },
        }
      });
    });

    this.logger.info(`Job ${jobId} cancelled by user ${userId}`);
    return { success: true };
  }

  async getJobEvents(userId: string | null, isAdmin: boolean, jobId: string): Promise<any[]> {
    // Verify visibility first
    await this.getJob(userId, isAdmin, jobId);

    const events = await this.db.jobEvent.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    });

    return events;
  }
}
