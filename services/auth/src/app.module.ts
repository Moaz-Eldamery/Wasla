import { Module } from '@nestjs/common';
import { AuthorizationController } from './authorization/authorization.controller.js';
import { HealthController } from './health.controller.js';

// The gateway sends /auth/* here without stripping the prefix, so every route
// in this service lives under /auth.
export const GLOBAL_PREFIX = 'auth';

@Module({
  imports: [],
  controllers: [HealthController, AuthorizationController],
  providers: [],
})
export class AppModule {}
