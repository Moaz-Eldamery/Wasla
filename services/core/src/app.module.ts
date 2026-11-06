import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { JourneyModule } from './modules/patient-journey/journey.module.js';
import { QueueModule } from './modules/queue-checkin/queue.module.js';
import { SharedModule } from './shared/shared.module.js';

@Module({
  imports: [SharedModule, AppointmentsModule, QueueModule, JourneyModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
