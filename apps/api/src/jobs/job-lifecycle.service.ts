import { Injectable, BadRequestException } from '@nestjs/common';
import { JobStatus } from '@computemesh/database';

@Injectable()
export class JobLifecycleService {
  canTransition(from: JobStatus | null, to: JobStatus): boolean {
    if (from === null && to === 'CREATED') return true;
    if (from === 'CREATED' && to === 'QUEUED') return true;
    if (from === 'CREATED' && to === 'CANCELLED') return true;
    if (from === 'QUEUED' && to === 'CANCELLED') return true;
    
    // M6
    if (from === 'QUEUED' && to === 'SCHEDULING') return true;
    if (from === 'SCHEDULING' && to === 'ASSIGNED') return true;
    if (from === 'SCHEDULING' && to === 'QUEUED') return true;
    if (from === 'SCHEDULING' && to === 'CANCELLED') return true;

    return false;
  }

  assertTransition(from: JobStatus | null, to: JobStatus) {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(`Invalid job status transition from ${from || 'none'} to ${to}`);
    }
  }
}
