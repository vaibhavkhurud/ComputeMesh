import * as dotenv from 'dotenv';
import { createLogger } from '@computemesh/logger';
import { Worker } from './worker';

dotenv.config();

const logger = createLogger('worker');

async function main() {
  const worker = new Worker(logger);

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM');
    await worker.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught Exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled Rejection');
  });

  try {
    await worker.start();
  } catch (error) {
    logger.error({ err: error }, 'Failed to start worker');
    process.exit(1);
  }
}

main();
