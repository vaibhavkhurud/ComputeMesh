import { Module } from '@nestjs/common';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { CheckpointsCleanupService } from './checkpoints-cleanup.service';
import { AuthModule } from '../auth/auth.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [AuthModule, AgentsModule],
  controllers: [CheckpointsController],
  providers: [CheckpointsService, CheckpointsCleanupService],
  exports: [CheckpointsService, CheckpointsCleanupService]
})
export class CheckpointsModule {}
