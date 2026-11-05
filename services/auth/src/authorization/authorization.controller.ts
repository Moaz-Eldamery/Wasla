import { Controller, Get, HttpCode, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { unauthenticated } from '../api-error.js';
import { bearerToken, SessionService } from '../authentication/session.service.js';

/**
 * The check Traefik calls (forward-auth) before every request to the core.
 *
 * On a live session of an active account it answers 200 with X-User-Id,
 * X-User-Type and X-User-Roles, which the gateway copies onto the forwarded
 * request. Anything else is 401, and an error is a 5xx: the gateway refuses
 * the request either way, so the check fails closed.
 */
@Controller('check')
export class AuthorizationController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @HttpCode(200)
  async check(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const user = await this.sessions.validate(bearerToken(req));
    if (!user) throw unauthenticated();

    res.setHeader('X-User-Id', user.id);
    res.setHeader('X-User-Type', user.type);
    res.setHeader('X-User-Roles', user.roles.join(','));
  }
}
