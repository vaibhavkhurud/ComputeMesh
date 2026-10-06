import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@computemesh/logger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import helmet from 'helmet';
import * as express from 'express';

async function bootstrap() {
  const logger = createLogger('api');
  const app = await NestFactory.create(AppModule, {
    logger: {
      log: (message: string) => logger.info(message),
      error: (message: string, trace?: string) => logger.error({ trace }, message),
      warn: (message: string) => logger.warn(message),
      debug: (message: string) => logger.debug(message),
      verbose: (message: string) => logger.trace(message),
    },
  });

  app.use(helmet());
  
  // Isolate raw-body handling for Stripe webhooks
  app.use(
    '/payments/stripe/webhook',
    express.raw({ type: 'application/json' })
  );
  
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const origins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000'];

  app.enableCors({
    origin: origins,
  });

  // Request ID middleware — applied globally as a function
  app.use((req: Request, _res: Response, next: NextFunction) => {
    let reqId = req.headers['x-request-id'] as string;
    if (reqId && typeof reqId === 'string') {
      reqId = reqId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
    }
    req.requestId = reqId || uuidv4();
    _res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;
  await app.listen(port, '0.0.0.0');

  logger.info(`ComputeMesh API started on port ${port} (0.0.0.0)`);
}
bootstrap();
