import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, type ErrorCode } from './api-error.js';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'FILE_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/** Turns every error into the contract's error body. Unknown errors become 500 INTERNAL. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiError) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status] ?? 'INTERNAL';
      res.status(status).json({ error: { code, message: exception.message } });
      return;
    }

    this.logger.error(exception);
    res
      .status(500)
      .json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  }
}
