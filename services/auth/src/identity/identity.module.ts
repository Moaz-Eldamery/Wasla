import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';

@Module({
  imports: [AuthenticationModule],
  controllers: [IdentityController],
  providers: [IdentityService],
})
export class IdentityModule {}
