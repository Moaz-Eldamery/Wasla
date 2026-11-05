import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp } from '../audit.service.js';
import { AuthenticationService } from './authentication.service.js';
import { LoginDto, ResendCodeDto, VerifyPhoneDto } from './dto/authentication.dto.js';
import { bearerToken } from './session.service.js';

/**
 * Login, logout, the current user and phone codes. The gateway sends /auth/*
 * here without its auth check, so these routes read the session themselves.
 */
@Controller()
export class AuthenticationController {
  constructor(private readonly auth: AuthenticationService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.auth.login(body.phone, body.password, clientIp(req));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request): Promise<void> {
    await this.auth.logout(bearerToken(req), clientIp(req));
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.auth.me(bearerToken(req));
  }

  @Post('verify-phone')
  @HttpCode(204)
  async verifyPhone(@Body() body: VerifyPhoneDto, @Req() req: Request): Promise<void> {
    await this.auth.verifyPhone(body.phone, body.code, clientIp(req));
  }

  @Post('resend-code')
  @HttpCode(202)
  resendCode(@Body() body: ResendCodeDto) {
    return this.auth.resendCode(body.phone);
  }
}
