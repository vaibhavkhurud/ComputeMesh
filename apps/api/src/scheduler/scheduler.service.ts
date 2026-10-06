import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private db = getDatabaseClient();
  private sweepTimer!: NodeJS.Timeout;

  constructor(@Inject('LOGGER') private readonly logger: any) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => this.sweepExpiredLeases(), 60000);
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async sweepExpiredLeases() {
    this.logger.info('Sweeping expired leases...');
    
    // 1. Safe scan without locking
    const expired = await this.db.$queryRaw<{id: string, jobId: string, assignmentId: string}[]>`
      SELECT id, "jobId", "assignmentId" FROM "execution_leases" 
      WHERE status = 'ACTIVE' AND "expiresAt" <= NOW()
    `;

    if (!expired.length) return;

    this.logger.info(`Found ${expired.length} expired leases`);

    for (const lease of expired) {
      const didRecover = await this.db.$transaction(async (tx) => {
        // Safe lookup done above. Lock top-down.
        // Lock Job
        const jobs = await tx.$queryRaw<{status: string, recoveryAttempts: number}[]>`
          SELECT status, "recoveryAttempts" FROM jobs WHERE id = ${lease.jobId} FOR UPDATE
        `;
        if (!jobs.length) return;
        const job = jobs[0];

        // Lock JobAssignment
        const assignments = await tx.$queryRaw<{status: string}[]>`
          SELECT status FROM job_assignments WHERE id = ${lease.assignmentId} FOR UPDATE
        `;
        if (!assignments.length) return;

        // Lock ExecutionLease
        const leases = await tx.$queryRaw<{status: string}[]>`
          SELECT status FROM execution_leases WHERE id = ${lease.id} FOR UPDATE
        `;
        if (!leases.length || leases[0].status !== 'ACTIVE') return;

        // Perform M10 Recovery transition
        await tx.$executeRaw`
          UPDATE execution_leases SET status = 'EXPIRED', "updatedAt" = NOW() WHERE id = ${lease.id}
        `;
        
        await tx.$executeRaw`
          UPDATE job_assignments SET status = 'RELEASED', "releasedAt" = NOW(), "failureReason" = 'PROVIDER_FAILURE' WHERE id = ${lease.assignmentId}
        `;

        const newAttempts = job.recoveryAttempts + 1;
        await tx.$executeRaw`
          UPDATE jobs SET "recoveryAttempts" = ${newAttempts} WHERE id = ${lease.jobId}
        `;

        await tx.jobEvent.create({
          data: {
            jobId: lease.jobId,
            eventType: 'PROVIDER_FAILURE_DETECTED',
            toStatus: 'INTERRUPTED',
            actorType: 'SYSTEM',
            actorId: 'scheduler',
            metadata: { assignmentId: lease.assignmentId, attempt: newAttempts }
          }
        });

        // Determine if recovery is possible
        const checkpoints = await tx.$queryRaw<{id: string, sequence: number}[]>`
          SELECT id, sequence FROM checkpoints WHERE "jobId" = ${lease.jobId} AND status = 'VERIFIED' ORDER BY sequence DESC LIMIT 1
        `;

        let nextStatus = 'FAILED';
        let willRecover = false;
        if (newAttempts < 3 && checkpoints.length > 0) {
          nextStatus = 'INTERRUPTED';
          willRecover = true;
        }

        await tx.job.update({
          where: { id: lease.jobId },
          data: { status: nextStatus as any }
        });

        await tx.jobEvent.create({
          data: {
            jobId: lease.jobId,
            eventType: 'RECOVERY_STARTED',
            toStatus: nextStatus as any,
            actorType: 'SYSTEM',
            actorId: 'scheduler',
            metadata: { checkpointId: checkpoints.length > 0 ? checkpoints[0].id : null, attempt: newAttempts }
          }
        });

        if (nextStatus === 'FAILED') {
          await tx.jobEvent.create({
            data: {
              jobId: lease.jobId,
              eventType: 'STATUS_CHANGED',
              fromStatus: 'INTERRUPTED',
              toStatus: nextStatus as any,
              actorType: 'SYSTEM',
              actorId: 'scheduler',
              metadata: { message: 'Recovery exhausted or impossible' }
            }
          });
        }

        // Return a flag to schedule after transaction
        return willRecover;
      });

      if (didRecover) {
        // Kick off scheduling asynchronously
        this.scheduleJob(lease.jobId).catch(err => this.logger.error(`Recovery schedule error: ${err.message}`));
      }
    }
  }

  async scheduleJob(jobId: string) {
    // 1. ATOMIC CLAIM (Phase 1)
    const claimed = await this.db.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({
        where: { id: jobId, status: { in: ['QUEUED', 'INTERRUPTED'] } },
        data: { status: 'SCHEDULING', updatedAt: new Date() }
      });
      if (updated.count === 1) {
        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: 'STATUS_CHANGED',
            toStatus: 'SCHEDULING',
            actorType: 'SYSTEM',
            actorId: 'scheduler',
            metadata: { message: 'Scheduler claimed job' }
          }
        });
        return true;
      }
      return false;
    });

    if (!claimed) {
      return { success: false, reason: 'ALREADY_CLAIMED_OR_NOT_QUEUED' };
    }

    try {
      // 2. DISCOVERY & MATCHING (Phase 2)
      // Get excluded providers from JobEvents
      const failEvents = await this.db.jobEvent.findMany({
        where: { jobId, eventType: 'PROVIDER_FAILURE_DETECTED' }
      });
      const failedAssignments = failEvents.map(e => (e.metadata as any)?.assignmentId).filter(Boolean);
      let excludedProviderIds: string[] = [];
      if (failedAssignments.length > 0) {
        const assignments = await this.db.jobAssignment.findMany({
          where: { id: { in: failedAssignments } }
        });
        excludedProviderIds = assignments.map(a => a.providerId);
      }
      // Query authoritative PostgreSQL db for machines
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const job = await this.db.job.findUnique({
        where: { id: jobId },
        include: { requirement: true }
      });
      if (!job || !job.requirement) {
        throw new Error('Job or requirement not found');
      }
      const reqs = job.requirement;
      
      const machineWhere: any = {
        status: 'REGISTERED',
        providerId: { notIn: excludedProviderIds },
        provider: { status: 'ACTIVE' },
        agentIdentity: {
          status: 'ACTIVE',
          lastHeartbeatAt: { gte: fiveMinutesAgo }
        }
      };

      // Fetch all candidates where agent is fresh and provider active, machine registered.
      const allCandidates = await this.db.machine.findMany({
        where: machineWhere,
        include: { discovery: true, pricing: true }
      });

      const eligible = allCandidates.filter(c => {
        if (!c.discovery) return false;
        
        // Price Ceiling Check
        if (reqs.maxPriceCentsPerHour !== null && reqs.maxPriceCentsPerHour !== undefined && (c as any).pricing) {
          const p = (c as any).pricing;
          const d = c.discovery;
          const cpuCores = d.cpuLogicalCores || 0;
          const memoryGb = Math.ceil((d.memoryMb || 0) / 1024);
          const gpuCount = d.gpuCount || 0;
          const componentPrice = (p.cpuCentsPerHour * cpuCores) + (p.memoryGbCentsPerHour * memoryGb) + (p.gpuCentsPerHour * gpuCount);
          const actualPrice = Math.max(p.flatCentsPerHour, componentPrice);
          if (actualPrice > reqs.maxPriceCentsPerHour) {
            return false;
          }
        }
        
        return this.machineMatchesJobRequirements(reqs, c);
      });

      if (eligible.length === 0) {
        await this.handleSchedulingFailure(jobId, 'No eligible candidates found');
        return { success: false, reason: 'NO_CANDIDATE' };
      }

      // Ranking
      const ranked = eligible.map(c => {
        const d = c.discovery!;
        const cLogicalCores = d.cpuLogicalCores ?? 0;
        const rCoresMin = reqs.cpuCoresMin ?? 0;
        const dMem = d.memoryMb ?? 0;
        const rMem = reqs.memoryMbMin ?? 0;
        
        let score = (cLogicalCores - rCoresMin) + ((dMem - rMem) / 1024);
        
        return { machine: c, score };
      });

      ranked.sort((a, b) => {
        // M12 Deterministic Preference Targeting
        if (reqs.targetMachineId) {
          if (a.machine.id === reqs.targetMachineId && b.machine.id !== reqs.targetMachineId) return -1;
          if (b.machine.id === reqs.targetMachineId && a.machine.id !== reqs.targetMachineId) return 1;
        }
        if (a.score !== b.score) return b.score - a.score;
        return a.machine.id.localeCompare(b.machine.id);
      });

      const selected = ranked[0];

      // 3. FINAL ATOMIC BIND (Phase 3)
      const assigned = await this.db.$transaction(async (tx) => {
        // Authoritative read of the job
        const currentJobs = await tx.$queryRaw<{status: string}[]>`
          SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE
        `;
        if (!currentJobs.length) return false;
        if (currentJobs[0].status !== 'SCHEDULING') return false; // Cancelled concurrently

        // Authoritative read of machine eligibility
        // We use inner joins to ensure all statuses hold.
        const validMachines = await tx.$queryRaw<{id: string}[]>`
          SELECT m.id
          FROM machines m
          JOIN providers p ON m."providerId" = p.id
          JOIN agent_identities a ON m.id = a."machineId"
          JOIN machine_discoveries md ON m.id = md."machineId"
          WHERE m.id = ${selected.machine.id}
            AND m.status = 'REGISTERED'
            AND p.status = 'ACTIVE'
            AND a.status = 'ACTIVE'
            AND a."lastHeartbeatAt" >= ${fiveMinutesAgo}
          FOR UPDATE
        `;

        if (!validMachines.length) {
          return 'ELIGIBILITY_FAILED';
        }

        // Note: we trust the discovery matching done in Phase 2 unless discovery updated,
        // but since M4 doesn't dynamically change hardware frequently, checking just online presence is enough here.
        // For absolute correctness, one could re-run the match. We assume it's stable if the machine is still active.

        await tx.job.update({
          where: { id: jobId },
          data: { status: 'ASSIGNED', updatedAt: new Date() }
        });

        await tx.jobAssignment.create({
          data: {
            jobId,
            machineId: selected.machine.id,
            providerId: selected.machine.providerId,
            status: 'ACTIVE',
            schedulerScore: selected.score
          }
        });

        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: 'STATUS_CHANGED',
            fromStatus: 'SCHEDULING',
            toStatus: 'ASSIGNED',
            actorType: 'SYSTEM',
            actorId: 'scheduler',
            metadata: { machineId: selected.machine.id, score: selected.score }
          }
        });

        return true;
      });

      if (assigned === 'ELIGIBILITY_FAILED') {
        // Final eligibility check failed. Mark as QUEUED.
        await this.handleSchedulingFailure(jobId, 'Final candidate eligibility check failed');
        return { success: false, reason: 'FINAL_ELIGIBILITY_FAILED' };
      }

      if (assigned === false) {
        // Job was cancelled. We do nothing and let it stay cancelled.
        return { success: false, reason: 'CANCELLED_DURING_SCHEDULING' };
      }

      this.logger.info(`Job ${jobId} assigned to machine ${selected.machine.id}`);
      return { success: true };
      
    } catch (e: any) {
      this.logger.error(`Scheduler error for job ${jobId}: ${e.message}`);
      await this.handleSchedulingFailure(jobId, e.message);
      return { success: false, reason: 'ERROR' };
    }
  }

  private machineMatchesJobRequirements(reqs: any, c: any): boolean {
    const d = c.discovery;
    
    // CPU & RAM
    if (d.discoveryStatus === 'FAILED' && !d.cpuLogicalCores) return false;
    if (!d.cpuLogicalCores || d.cpuLogicalCores < reqs.cpuCoresMin) return false;
    if (!d.memoryMb || d.memoryMb < reqs.memoryMbMin) return false;

    // OS
    if (reqs.operatingSystem) {
      if (!d.operatingSystem || d.operatingSystem.toLowerCase() !== reqs.operatingSystem.toLowerCase()) return false;
    }

    // Architecture
    if (reqs.architecture) {
      if (!d.cpuArchitecture) return false;
      let reqArch = reqs.architecture.toLowerCase();
      let cArch = d.cpuArchitecture.toLowerCase();
      if (reqArch === 'x86_64') reqArch = 'amd64';
      if (cArch === 'x86_64') cArch = 'amd64';
      if (cArch !== reqArch) return false;
    }

    // Region
    if (reqs.region && c.region !== reqs.region) return false;

    // GPU Rules
    if (reqs.gpuRequired) {
      if (d.gpuDiscoveryStatus !== 'SUCCESS') return false;
      if (d.gpuCount === null || d.gpuCount <= 0) return false;
    }

    if (reqs.gpuCount && reqs.gpuCount > 0) {
      if (d.gpuDiscoveryStatus !== 'SUCCESS') return false;
      if (d.gpuCount === null || d.gpuCount < reqs.gpuCount) return false;
    }

    if (reqs.gpuMemoryMbMin) {
      if (d.gpuDiscoveryStatus !== 'SUCCESS') return false;
      if (d.gpuMemoryMb === null || d.gpuMemoryMb < reqs.gpuMemoryMbMin) return false;
    }

    if (reqs.gpuModel) {
      if (d.gpuDiscoveryStatus !== 'SUCCESS') return false;
      if (!d.gpuModel || d.gpuModel.trim().toLowerCase() !== reqs.gpuModel.trim().toLowerCase()) return false;
    }

    if (reqs.cudaVersion) {
      if (d.gpuDiscoveryStatus !== 'SUCCESS') return false;
      if (!d.cudaVersion) return false;
      
      const reqCuda = reqs.cudaVersion.split('.').map((n: string) => parseInt(n, 10));
      const cCuda = d.cudaVersion.split('.').map((n: string) => parseInt(n, 10));
      
      if (reqCuda.length < 2 || cCuda.length < 2 || isNaN(reqCuda[0]) || isNaN(cCuda[0])) return false;
      
      if (cCuda[0] < reqCuda[0]) return false;
      if (cCuda[0] === reqCuda[0] && cCuda[1] < reqCuda[1]) return false;
    }

    return true;
  }
  
  private async handleSchedulingFailure(jobId: string, reason: string) {
    await this.db.$transaction(async (tx) => {
      const currentJobs = await tx.$queryRaw<{status: string}[]>`
        SELECT status FROM jobs WHERE id = ${jobId} FOR UPDATE
      `;
      if (!currentJobs.length) return;
      if (currentJobs[0].status !== 'SCHEDULING') return; // Cancelled
      
      await tx.job.update({
        where: { id: jobId },
        data: { status: 'QUEUED', updatedAt: new Date() }
      });
      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'STATUS_CHANGED',
          fromStatus: 'SCHEDULING',
          toStatus: 'QUEUED',
          actorType: 'SYSTEM',
          actorId: 'scheduler',
          metadata: { message: 'Scheduling failed', reason }
        }
      });
    });
  }
}
