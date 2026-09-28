import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from '@computemesh/logger';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const record = resp as Record<string, unknown>;
        if (typeof record.message === 'string') {
          message = record.message;
        } else if (Array.isArray(record.message) && record.message.length > 0 && typeof record.message[0] === 'string') {
          message = record.message[0];
        }
        if (typeof record.error === 'string') {
          code = record.error;
        } else {
          code = HttpStatus[status]?.toString() || code;
        }
      } else if (typeof resp === 'string') {
        message = resp;
        code = HttpStatus[status]?.toString() || code;
      }
    } else {
      // Unhandled exception
    }

    this.logger.error({ requestId, err: exception, status }, 'HTTP Request Error');

    response.status(status).json({
      error: {
        code,
        message,
        requestId,
      },
    });
  }
}
