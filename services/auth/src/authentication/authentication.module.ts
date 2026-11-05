import { Module } from '@nestjs/common';
import { AuthenticationController } from './authentication.controller.js';
import { AuthenticationService } from './authentication.service.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthenticationController],
  providers: [AuthenticationService, OtpService, SessionService],
  exports: [OtpService, SessionService],
})
export class AuthenticationModule {}
