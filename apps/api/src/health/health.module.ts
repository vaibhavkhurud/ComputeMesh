import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { redisProvider } from '../providers/redis.provider';
import { storageProvider } from '../providers/storage.provider';
import { databaseProvider } from '../providers/database.provider';

@Module({
  controllers: [HealthController],
  providers: [HealthService, redisProvider, storageProvider, databaseProvider],
})
export class HealthModule {}
