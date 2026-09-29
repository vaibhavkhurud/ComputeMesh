const fs = require('fs');
const p = require('path');
const file = p.join(process.env.HOME, 'projects/ComputeMesh/apps/api/src/scheduler/scheduler.service.ts');
let c = fs.readFileSync(file, 'utf-8');

// Replace imports
c = c.replace(/import \{ Cron, CronExpression \} from '@nestjs\/schedule';/, '');
c = c.replace(/import \{ Injectable, Inject \} from '@nestjs\/common';/, 'import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from \'@nestjs/common\';\nimport { JobStatus } from \'@computemesh/database\';');

// Replace class definition
c = c.replace(/export class SchedulerService \{/, 'export class SchedulerService implements OnModuleInit, OnModuleDestroy {\n  private sweepTimer: NodeJS.Timeout;');

// Remove @Cron
c = c.replace(/\@Cron\(CronExpression\.EVERY_MINUTE\)/, 'onModuleInit() {\n    this.sweepTimer = setInterval(() => this.sweepExpiredLeases(), 60000);\n  }\n\n  onModuleDestroy() {\n    if (this.sweepTimer) clearInterval(this.sweepTimer);\n  }\n');

// Fix JobEvent
c = c.replace(/await tx\.jobEvent\.create\(\{[\s\S]*?data: \{[\s\S]*?jobId: lease\.jobId,[\s\S]*?eventType: 'LEASE_EXPIRED',[\s\S]*?actorType: 'SYSTEM',[\s\S]*?actorId: 'scheduler',[\s\S]*?metadata: \{ assignmentId: lease\.assignmentId, message: 'Lease expired' \}[\s\S]*?\}[\s\S]*?\}\);/, 
\const currentJobs = await tx.<{status: JobStatus}[]>\\SELECT status FROM jobs WHERE id = \\\;
        const jobStatus = currentJobs.length ? currentJobs[0].status : JobStatus.RUNNING;
        
        await tx.jobEvent.create({
          data: {
            jobId: lease.jobId,
            eventType: 'LEASE_EXPIRED',
            toStatus: jobStatus,
            actorType: 'SYSTEM',
            actorId: 'scheduler',
            metadata: { assignmentId: lease.assignmentId, message: 'Lease expired' }
          }
        });\);

fs.writeFileSync(file, c);
