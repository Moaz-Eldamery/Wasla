import { Controller, Get, Param } from '@nestjs/common';
import { IdPipe } from '../../shared/api-error.js';
import { CurrentCaller, type Caller } from '../../shared/caller.js';
import { Roles } from '../../shared/roles.guard.js';
import { JourneyService } from './journey.service.js';

/** Where the patient is in their visit and what to do next. */
@Controller()
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Get('appointments/:appointmentId/journey')
  @Roles('PATIENT')
  getJourney(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) appointmentId: string,
  ) {
    return this.journey.getJourney(caller, appointmentId);
  }
}
