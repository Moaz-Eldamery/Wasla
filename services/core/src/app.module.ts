import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { SharedModule } from './shared/shared.module.js';

@Module({
  imports: [SharedModule, AppointmentsModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
