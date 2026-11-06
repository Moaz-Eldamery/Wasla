import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IdPipe } from '../../shared/api-error.js';
import { CurrentCaller, type Caller } from '../../shared/caller.js';
import { Roles } from '../../shared/roles.guard.js';
import { CallNextDto } from './dto/queue.dto.js';
import { QueueService } from './queue.service.js';

/** Check-in, calling the next patient, finishing the visit, and the queue. */
@Controller()
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Post('appointments/:appointmentId/check-in')
  @HttpCode(200)
  @Roles('RECEPTIONIST')
  checkIn(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) appointmentId: string,
  ) {
    return this.queue.checkIn(caller, appointmentId);
  }

  @Get('clinics/:clinicId/queue')
  @Roles('RECEPTIONIST', 'DOCTOR')
  getClinicQueue(
    @CurrentCaller() caller: Caller,
    @Param('clinicId', IdPipe) clinicId: string,
  ) {
    return this.queue.getClinicQueue(caller, clinicId);
  }

  @Post('doctors/me/queue/call-next')
  @HttpCode(200)
  @Roles('DOCTOR')
  callNext(@CurrentCaller() caller: Caller, @Body() body: CallNextDto) {
    return this.queue.callNext(caller, body.clinicId);
  }

  @Post('appointments/:appointmentId/complete')
  @HttpCode(200)
  @Roles('DOCTOR')
  complete(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) appointmentId: string,
  ) {
    return this.queue.complete(caller, appointmentId);
  }

  @Get('appointments/:appointmentId/queue-position')
  @Roles('PATIENT')
  getPosition(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) appointmentId: string,
  ) {
    return this.queue.getPosition(caller, appointmentId);
  }
}
