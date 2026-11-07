import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { clientIp } from '../audit.service.js';
import { bearerToken, type SessionUser } from '../authentication/session.service.js';
import { StaffService } from './staff.service.js';

type RequestWithAdmin = Request & { admin?: SessionUser };

/**
 * Lets only a signed-in admin through. /auth/* comes through the gateway
 * without its auth check, so admin routes here check the session themselves.
 * Runs before validation, so a caller without a session always gets 401.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly staff: StaffService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithAdmin>();
    req.admin = await this.staff.requireAdmin(bearerToken(req), req.path, clientIp(req));
    return true;
  }
}

/** The admin `AdminGuard` let through. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser =>
    ctx.switchToHttp().getRequest<RequestWithAdmin>().admin!,
);
