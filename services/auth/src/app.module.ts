import {
  BadRequestException,
  Global,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ApiError } from './api-error.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { AuditService } from './audit.service.js';
import { AuthenticationModule } from './authentication/authentication.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { HealthController } from './health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { PrismaService } from './prisma.service.js';

// The gateway sends /auth/* here without stripping the prefix, so every route
// in this service lives under /auth.
export const GLOBAL_PREFIX = 'auth';

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

/** The database client and audit writer, for every module. */
@Global()
@Module({
  providers: [PrismaService, AuditService],
  exports: [PrismaService, AuditService],
})
class CommonModule {}

@Module({
  imports: [CommonModule, AuthenticationModule, IdentityModule, AuthorizationModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_PIPE, useFactory: validationPipe },
  ],
})
export class AppModule {}
