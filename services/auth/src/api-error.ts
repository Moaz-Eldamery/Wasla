import { HttpException } from '@nestjs/common';

/** Error codes from contracts/openapi.yaml (`ErrorCode`) that this service uses. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PHONE_TAKEN'
  | 'EMAIL_TAKEN'
  | 'PHONE_NOT_VERIFIED'
  | 'INVALID_CREDENTIALS'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'INTERNAL';

export interface ErrorDetail {
  field: string;
  problem: string;
}

/** An error in the contract's format: `{ error: { code, message, details } }`. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    details?: ErrorDetail[],
    /** Sent as the `Retry-After` header (RATE_LIMITED). */
    readonly retryAfterSeconds?: number,
  ) {
    super({ error: { code, message, ...(details && { details }) } }, status);
  }
}

export function unauthenticated(): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', 'No valid session.');
}

export function forbidden(): ApiError {
  return new ApiError(403, 'FORBIDDEN', "Your account can't do this.");
}

export function rateLimited(retryAfterSeconds: number): ApiError {
  return new ApiError(
    429,
    'RATE_LIMITED',
    'Too many attempts. Try again later.',
    undefined,
    retryAfterSeconds,
  );
}
