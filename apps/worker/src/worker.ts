import { Logger } from '@computemesh/logger';
import Redis from 'ioredis';

export class Worker {
  private redis: Redis | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async start(): Promise<void> {
    this.logger.info('ComputeMesh worker starting...');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.redis = new Redis(redisUrl);
      
      this.redis.on('connect', () => {
        this.logger.info('Redis connected');
      });

      this.redis.on('error', (err) => {
        this.logger.error({ err }, 'Redis connection error');
      });

      this.logger.info('ComputeMesh worker started');
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to start ComputeMesh worker');
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('ComputeMesh worker shutting down...');
    if (this.redis) {
      await this.redis.quit();
    }
    this.logger.info('ComputeMesh worker stopped');
  }
}
