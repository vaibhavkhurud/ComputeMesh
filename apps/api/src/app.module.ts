import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

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
import { CheckpointsModule } from './checkpoints/checkpoints.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { FinancialModule } from './financial/financial.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    // Rate limiting: 50 requests per 60 seconds globally (M11 Security Hardening)
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 50,
    }]),
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    MarketplaceModule,
    HealthModule,
    AuthModule,
    ProvidersModule,
    AgentsModule,
    JobsModule,
    SchedulerModule,
    AgentExecutionModule,
    CheckpointsModule,
    FinancialModule,
    PaymentsModule,
  ],
  providers: [
    redisProvider,
    storageProvider,
    databaseProvider,
    {
      provide: 'LOGGER',
      useValue: createLogger('api'),
    },
    // Global throttler guard (M11 Security Hardening)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [redisProvider, storageProvider, databaseProvider, 'LOGGER'],
})
export class AppModule {}
