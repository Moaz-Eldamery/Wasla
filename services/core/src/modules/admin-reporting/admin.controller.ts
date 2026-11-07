import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { IdPipe } from '../../shared/api-error.js';
import { CurrentCaller, type Caller } from '../../shared/caller.js';
import { Roles } from '../../shared/roles.guard.js';
import {
  AuditLogQuery,
  ClinicDto,
  DepartmentNameDto,
  NewDepartmentDto,
  StatisticsQuery,
} from './admin.dto.js';
import { AuditLogService } from './audit-log.service.js';
import { HospitalSetupService } from './hospital-setup.service.js';
import { StatisticsService } from './statistics.service.js';

/** The admin dashboard: hospital setup, statistics and the audit log. Admins only. */
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly setup: HospitalSetupService,
    private readonly statistics: StatisticsService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ---------------------------------------------------------------- departments

  @Get('departments')
  listDepartments() {
    return this.setup.listDepartments();
  }

  @Post('departments')
  createDepartment(@CurrentCaller() caller: Caller, @Body() body: NewDepartmentDto) {
    return this.setup.createDepartment(caller, body.kind, body.name);
  }

  @Put('departments/:departmentId')
  renameDepartment(
    @CurrentCaller() caller: Caller,
    @Param('departmentId', IdPipe) departmentId: string,
    @Body() body: DepartmentNameDto,
  ) {
    return this.setup.renameDepartment(caller, departmentId, body.name);
  }

  @Post('departments/:departmentId/deactivate')
  @HttpCode(200)
  deactivateDepartment(@CurrentCaller() caller: Caller, @Param('departmentId', IdPipe) departmentId: string) {
    return this.setup.setDepartmentActive(caller, departmentId, false);
  }

  @Post('departments/:departmentId/reactivate')
  @HttpCode(200)
  reactivateDepartment(@CurrentCaller() caller: Caller, @Param('departmentId', IdPipe) departmentId: string) {
    return this.setup.setDepartmentActive(caller, departmentId, true);
  }

  // ---------------------------------------------------------------- clinics

  @Post('departments/:departmentId/clinics')
  createClinic(
    @CurrentCaller() caller: Caller,
    @Param('departmentId', IdPipe) departmentId: string,
    @Body() body: ClinicDto,
  ) {
    return this.setup.createClinic(caller, departmentId, body);
  }

  @Put('clinics/:clinicId')
  updateClinic(
    @CurrentCaller() caller: Caller,
    @Param('clinicId', IdPipe) clinicId: string,
    @Body() body: ClinicDto,
  ) {
    return this.setup.updateClinic(caller, clinicId, body);
  }

  @Post('clinics/:clinicId/deactivate')
  @HttpCode(200)
  deactivateClinic(@CurrentCaller() caller: Caller, @Param('clinicId', IdPipe) clinicId: string) {
    return this.setup.setClinicActive(caller, clinicId, false);
  }

  @Post('clinics/:clinicId/reactivate')
  @HttpCode(200)
  reactivateClinic(@CurrentCaller() caller: Caller, @Param('clinicId', IdPipe) clinicId: string) {
    return this.setup.setClinicActive(caller, clinicId, true);
  }

  @Put('clinics/:clinicId/staff/:staffId')
  assignStaff(
    @CurrentCaller() caller: Caller,
    @Param('clinicId', IdPipe) clinicId: string,
    @Param('staffId', IdPipe) staffId: string,
  ) {
    return this.setup.assignStaff(caller, clinicId, staffId);
  }

  @Delete('clinics/:clinicId/staff/:staffId')
  unassignStaff(
    @CurrentCaller() caller: Caller,
    @Param('clinicId', IdPipe) clinicId: string,
    @Param('staffId', IdPipe) staffId: string,
  ) {
    return this.setup.unassignStaff(caller, clinicId, staffId);
  }

  // ---------------------------------------------------------------- reporting

  @Get('statistics')
  getStatistics(@Query() query: StatisticsQuery) {
    return this.statistics.get(query.from, query.to, query.departmentId);
  }

  @Get('audit-log')
  searchAuditLog(@Query() query: AuditLogQuery) {
    return this.auditLog.search(query);
  }
}
