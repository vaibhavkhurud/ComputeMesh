import { Module } from '@nestjs/common';
import { AgentExecutionController } from './agent-execution.controller';
import { AgentExecutionService } from './agent-execution.service';

import { createLogger } from '@computemesh/logger';

@Module({
  controllers: [AgentExecutionController],
  providers: [
    AgentExecutionService,
    {
      provide: 'LOGGER',
      useValue: createLogger('agent-execution'),
    },
  ],
})
export class AgentExecutionModule {}
