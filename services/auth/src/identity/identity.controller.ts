import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp } from '../audit.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { IdentityService } from './identity.service.js';

@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  /** Patient sign-up. 201 with the code's expiry (and, in the prototype, the code). */
  @Post('register')
  register(@Body() body: RegisterDto, @Req() req: Request) {
    return this.identity.registerPatient(body.name, body.phone, body.password, clientIp(req));
  }
}
