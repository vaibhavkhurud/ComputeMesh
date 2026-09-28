import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@computemesh/logger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

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

  const origins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000'];

  app.enableCors({
    origin: origins,
  });

  // Request ID middleware — applied globally as a function
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = req.headers['x-request-id'] as string || uuidv4();
    _res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;
  await app.listen(port);

  logger.info(`ComputeMesh API started on port ${port}`);
}
bootstrap();
