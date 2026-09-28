import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobLifecycleService } from './job-lifecycle.service';
import { createLogger } from '@computemesh/logger';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobLifecycleService,
    {
      provide: 'LOGGER',
      useValue: createLogger('jobs'),
    },
  ],
})
export class JobsModule {}
