import {
  BadRequestException,
  Global,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ApiError } from './api-error.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { AuditService } from './audit.service.js';
import { PrismaService } from './prisma.service.js';
import { RolesGuard } from './roles.guard.js';

/** Request validation for every route. Bad input becomes 400 VALIDATION_FAILED. */
function validationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) =>
      errors.length === 0
        ? new BadRequestException()
        : new ApiError(
            400,
            'VALIDATION_FAILED',
            'Some fields are invalid.',
            errors.map((e) => ({
              field: e.property,
              problem: Object.values(e.constraints ?? {}).join('; '),
            })),
          ),
  });
}

/**
 * What every module gets: the database client, the audit log, and the
 * app-wide role check, error format and validation.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    AuditService,
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_PIPE, useFactory: validationPipe },
  ],
  exports: [PrismaService, AuditService],
})
export class SharedModule {}
