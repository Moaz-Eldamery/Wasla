import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { AdminChatbotModule } from './modules/admin-chatbot/admin-chatbot.module.js';
import { AdminReportingModule } from './modules/admin-reporting/admin-reporting.module.js';
import { JourneyModule } from './modules/patient-journey/journey.module.js';
import { QueueModule } from './modules/queue-checkin/queue.module.js';
import { SharedModule } from './shared/shared.module.js';
import { ClinicalModule } from './modules/clinical-care/clinical.module.js';

@Module({
  imports: [
    SharedModule,
    AppointmentsModule,
    QueueModule,
    JourneyModule,
    ClinicalModule,
    AdminChatbotModule,
    AdminReportingModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
