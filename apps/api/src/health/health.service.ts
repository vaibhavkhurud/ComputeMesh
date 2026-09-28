import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

@Injectable()
export class HealthService {
  constructor(
    @Inject('DATABASE_CLIENT') private readonly dbClient: { $queryRawUnsafe: (query: string) => Promise<unknown> },
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    @Inject('STORAGE_CLIENT') private readonly storageClient: S3Client,
  ) {}

  async checkPostgres(): Promise<'up' | 'down'> {
    try {
      await this.dbClient.$queryRawUnsafe('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  async checkRedis(): Promise<'up' | 'down'> {
    try {
      const ping = await this.redisClient.ping();
      return ping === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async checkStorage(): Promise<'up' | 'down'> {
    try {
      await this.storageClient.send(new ListBucketsCommand({}));
      return 'up';
    } catch {
      return 'down';
    }
  }

  async checkAll() {
    const [postgres, redis, storage] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkStorage(),
    ]);

    const dependencies = { postgres, redis, storage };
    const upCount = Object.values(dependencies).filter((s) => s === 'up').length;
    let status: 'ok' | 'degraded' | 'error' = 'ok';

    if (upCount === 0) {
      status = 'error';
    } else if (upCount < 3) {
      status = 'degraded';
    }

    return { status, dependencies };
  }
}
