import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AuditLogService } from './audit-log.service.js';
import { HospitalSetupService } from './hospital-setup.service.js';
import { StatisticsService } from './statistics.service.js';

@Module({
  controllers: [AdminController],
  providers: [HospitalSetupService, StatisticsService, AuditLogService],
  exports: [HospitalSetupService, StatisticsService],
})
export class AdminReportingModule {}
