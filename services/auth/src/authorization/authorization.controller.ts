import { Controller, Get, UnauthorizedException } from '@nestjs/common';

/**
 * The check Traefik calls (forward-auth) before every request to the core.
 *
 * On success it will answer 200 with the X-User-Id, X-User-Type and
 * X-User-Roles headers, which the gateway copies onto the forwarded request.
 * Sessions arrive with KAN-7. Until then nobody can be logged in, so every
 * request is refused: the check fails closed.
 */
@Controller('check')
export class AuthorizationController {
  @Get()
  check(): never {
    throw new UnauthorizedException();
  }
}
