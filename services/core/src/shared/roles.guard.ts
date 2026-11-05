import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from './api-error.js';
import { AuditService } from './audit.service.js';
import { hasRole, readCaller, type RequestWithCaller, type Role } from './caller.js';

const ROLES_KEY = 'wasla:roles';

/** Who may call this route. Every feature route needs it (the `x-roles` in the contract). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Checks the role on every route marked with `@Roles()`. This is the "right
 * role" check; each service method still checks that the record is the
 * caller's. Refusals are written to the audit log.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithCaller>();
    const caller = readCaller(req.headers);
    if (!caller) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'No valid session.');
    }
    req.caller = caller;

    if (!roles.some((role) => hasRole(caller, role))) {
      await this.audit.record({
        caller,
        action: 'access.forbidden',
        outcome: 'DENIED',
        details: { method: req.method, path: req.path },
      });
      throw new ApiError(403, 'FORBIDDEN', "Your role can't do this.");
    }
    return true;
  }
}
