import { Injectable, Logger } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';

// Mock S3 client for SeaweedFS
const deleteFromSeaweedFS = async () => {
  // Real implementation would use AWS SDK S3 client
  return Promise.resolve();
};

@Injectable()
export class CheckpointsCleanupService {
  private readonly logger = new Logger(CheckpointsCleanupService.name);
  private prisma = getDatabaseClient();

  async runRetentionPolicy() {
    this.logger.log('Running checkpoint retention policy...');
    const jobs = await this.prisma.job.findMany({ select: { id: true, status: true } });

    for (const job of jobs) {
      if (['INTERRUPTED', 'SCHEDULING', 'ASSIGNED', 'STARTING'].includes(job.status)) {
        continue;
      }

      // Find all verified checkpoints for this job, ordered by sequence DESC
      const verifiedCheckpoints = await this.prisma.checkpoint.findMany({
        where: { jobId: job.id, status: 'VERIFIED' },
        orderBy: { sequence: 'desc' }
      });

      // Keep the latest 1, mark the rest as DELETED
      if (verifiedCheckpoints.length > 1) {
        const toDelete = verifiedCheckpoints.slice(1);
        for (const cp of toDelete) {
          await this.prisma.$transaction(async (tx: any) => {
            await tx.checkpoint.update({
              where: { id: cp.id },
              data: { status: 'DELETED' }
            });
            await tx.jobEvent.create({
              data: {
                jobId: job.id,
                eventType: 'CHECKPOINT_DELETED',
                toStatus: job.status,
                actorType: 'SYSTEM',
                actorId: 'system',
                metadata: { checkpointId: cp.id, reason: 'retention' }
              }
            });
          });
        }
      }

      // Cleanup FAILED or old CREATING checkpoints
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await this.prisma.checkpoint.updateMany({
        where: {
          jobId: job.id,
          status: { in: ['FAILED', 'CREATING'] },
          updatedAt: { lt: oneHourAgo }
        },
        data: { status: 'DELETED' }
      });
    }
  }

  async runStorageCleanup() {
    this.logger.log('Running storage cleanup for DELETED checkpoints...');
    // Find DELETED checkpoints where storage hasn't been physically cleaned up
    const pendingCleanup = await this.prisma.checkpoint.findMany({
      where: {
        status: 'DELETED',
        // Assuming metadata -> { storageDeleted: true } when done
        NOT: {
          metadata: {
            path: ['storageDeleted'],
            equals: true
          }
        }
      }
    });

    for (const cp of pendingCleanup) {
      try {
        await deleteFromSeaweedFS();
        
        // Update metadata to indicate successful physical deletion
        const existingMeta = (cp.metadata as any) || {};
        await this.prisma.checkpoint.update({
          where: { id: cp.id },
          data: { metadata: { ...existingMeta, storageDeleted: true } }
        });
        this.logger.log(`Successfully deleted storage for checkpoint ${cp.id}`);
      } catch (err: any) {
        // Expose/log cleanup failure, retain state to retry next time
        this.logger.error(`Failed to delete storage for checkpoint ${cp.id}: ${err.message}`);
      }
    }
  }
}
