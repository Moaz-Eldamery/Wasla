import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module.js';
import { AdminGuard } from './admin.guard.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [AuthenticationModule],
  controllers: [IdentityController, StaffController],
  providers: [IdentityService, StaffService, AdminGuard],
})
export class IdentityModule {}
