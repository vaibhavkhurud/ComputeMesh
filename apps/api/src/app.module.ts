import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { redisProvider } from './providers/redis.provider';
import { storageProvider } from './providers/storage.provider';
import { databaseProvider } from './providers/database.provider';
import { createLogger } from '@computemesh/logger';

import { ProvidersModule } from './providers/providers.module';
import { AgentsModule } from './agents/agents.module';
import { JobsModule } from './jobs/jobs.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AgentExecutionModule } from './agent-execution/agent-execution.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    HealthModule,
    AuthModule,
    ProvidersModule,
    AgentsModule,
    JobsModule,
    SchedulerModule,
    AgentExecutionModule,
  ],
  providers: [
    redisProvider,
    storageProvider,
    databaseProvider,
    {
      provide: 'LOGGER',
      useValue: createLogger('api'),
    },
  ],
  exports: [redisProvider, storageProvider, databaseProvider, 'LOGGER'],
})
export class AppModule {}
