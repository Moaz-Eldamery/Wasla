import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module.js';
import { AuthorizationController } from './authorization.controller.js';

@Module({
  imports: [AuthenticationModule],
  controllers: [AuthorizationController],
})
export class AuthorizationModule {}
