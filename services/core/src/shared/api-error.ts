import { HttpException, ParseUUIDPipe } from '@nestjs/common';

/** Error codes from contracts/openapi.yaml (`ErrorCode`). */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SLOT_TAKEN'
  | 'SLOT_UNAVAILABLE'
  | 'INVALID_TRANSITION'
  | 'QUEUE_EMPTY'
  | 'ALREADY_IN_CONSULTATION'
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
  ) {
    super({ error: { code, message, ...(details && { details }) } }, status);
  }
}

/** Doesn't exist, or isn't the caller's. Both look the same on purpose. */
export function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Not found.');
}

/** For `:id` path parameters. A malformed ID can't exist, so it's a 404. */
export const IdPipe = new ParseUUIDPipe({ exceptionFactory: () => notFound() });
