import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { createLogger } from '@computemesh/logger';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SchedulerController],
  providers: [
    SchedulerService,
    {
      provide: 'LOGGER',
      useValue: createLogger('scheduler'),
    },
  ],
  exports: [SchedulerService],
})
export class SchedulerModule {}
