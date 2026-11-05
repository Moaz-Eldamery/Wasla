import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IdPipe } from '../../shared/api-error.js';
import { CurrentCaller, type Caller } from '../../shared/caller.js';
import { Roles } from '../../shared/roles.guard.js';
import { AppointmentsService } from './appointments.service.js';
import { BookAppointmentDto, DayQuery, MyAppointmentsQuery } from './dto/booking.dto.js';

/** Booking a slot and seeing appointments. */
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /** 201 when booked; 200 when the caller already held this slot (a retry). */
  @Post('appointments')
  @Roles('PATIENT')
  async book(
    @CurrentCaller() caller: Caller,
    @Body() body: BookAppointmentDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { appointment, created } = await this.appointments.book(caller, body.slotId);
    res.status(created ? 201 : 200);
    return appointment;
  }

  @Get('me/appointments')
  @Roles('PATIENT')
  listMine(@CurrentCaller() caller: Caller, @Query() query: MyAppointmentsQuery) {
    return this.appointments.listMine(caller, query.when);
  }

  @Get('appointments/:appointmentId')
  @Roles('PATIENT', 'RECEPTIONIST', 'DOCTOR')
  getOne(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) appointmentId: string,
  ) {
    return this.appointments.getOne(caller, appointmentId);
  }

  @Get('me/clinics')
  @Roles('RECEPTIONIST', 'DOCTOR', 'LAB')
  listMyClinics(@CurrentCaller() caller: Caller) {
    return this.appointments.listMyClinics(caller);
  }

  @Get('clinics/:clinicId/appointments')
  @Roles('RECEPTIONIST')
  listClinicDay(
    @CurrentCaller() caller: Caller,
    @Param('clinicId', IdPipe) clinicId: string,
    @Query() query: DayQuery,
  ) {
    return this.appointments.listClinicDay(caller, clinicId, query.date);
  }
}
