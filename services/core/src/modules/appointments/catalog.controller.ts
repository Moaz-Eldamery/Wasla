import { Controller, Get, Param, Query } from '@nestjs/common';
import { IdPipe } from '../../shared/api-error.js';
import { Roles } from '../../shared/roles.guard.js';
import { AppointmentsService } from './appointments.service.js';
import { DepartmentsQuery, FreeSlotsQuery } from './dto/booking.dto.js';

/** Browsing before booking: departments → doctors → free slots. */
@Controller()
export class CatalogController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('departments')
  @Roles('PATIENT', 'RECEPTIONIST', 'DOCTOR', 'LAB', 'ADMIN')
  listDepartments(@Query() query: DepartmentsQuery) {
    return this.appointments.listDepartments(query.kind);
  }

  @Get('departments/:departmentId/doctors')
  @Roles('PATIENT', 'RECEPTIONIST', 'ADMIN')
  listDoctors(@Param('departmentId', IdPipe) departmentId: string) {
    return this.appointments.listDepartmentDoctors(departmentId);
  }

  @Get('doctors/:doctorId/slots')
  @Roles('PATIENT', 'RECEPTIONIST')
  listFreeSlots(
    @Param('doctorId', IdPipe) doctorId: string,
    @Query() query: FreeSlotsQuery,
  ) {
    return this.appointments.listFreeSlots(doctorId, query.from, query.to);
  }
}
