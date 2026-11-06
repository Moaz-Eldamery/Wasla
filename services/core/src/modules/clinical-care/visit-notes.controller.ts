import { Body, Controller, Get, Header, Param, Put } from '@nestjs/common';
import { IdPipe } from '../../shared/api-error.js';
import { CurrentCaller, type Caller } from '../../shared/caller.js';
import { Roles } from '../../shared/roles.guard.js';
import { SaveVisitNotesDto } from './visit-notes.dto.js';
import { VisitNotesService } from './visit-notes.service.js';

@Controller('appointments/:appointmentId')
export class VisitNotesController {
  constructor(private readonly notes: VisitNotesService) {}

  @Get('notes')
  @Roles('DOCTOR')
  @Header('Cache-Control', 'private, no-store')
  latest(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) id: string,
  ) {
    return this.notes.latest(caller, id);
  }

  @Put('notes')
  @Roles('DOCTOR')
  @Header('Cache-Control', 'private, no-store')
  save(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) id: string,
    @Body() input: SaveVisitNotesDto,
  ) {
    return this.notes.save(caller, id, input);
  }

  @Get('notes/versions')
  @Roles('DOCTOR')
  @Header('Cache-Control', 'private, no-store')
  versions(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) id: string,
  ) {
    return this.notes.versions(caller, id);
  }

  @Get('summary')
  @Roles('PATIENT')
  @Header('Cache-Control', 'private, no-store')
  summary(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) id: string,
  ) {
    return this.notes.summary(caller, id);
  }
}
