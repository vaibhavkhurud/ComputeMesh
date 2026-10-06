import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { createLogger } from '@computemesh/logger';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    {
      provide: 'LOGGER',
      useValue: createLogger('agents'),
    },
  ],
})
export class AgentsModule {}
