import pino, { Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

export function createLogger(service: string): Logger {
  const isDevelopment = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
  const level = process.env.LOG_LEVEL || 'info';

  const options: pino.LoggerOptions = {
    level,
    base: {
      service,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (isDevelopment) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,service',
          messageFormat: '[{service}] {msg}',
        },
      },
    });
  }

  return pino(options);
}
