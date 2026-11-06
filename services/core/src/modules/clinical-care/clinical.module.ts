import { Module } from '@nestjs/common';
import { ClinicalController } from './clinical.controller.js';
import { ClinicalService } from './clinical.service.js';
import { VisitNotesController } from './visit-notes.controller.js';
import { VisitNotesService } from './visit-notes.service.js';

@Module({
  controllers: [ClinicalController, VisitNotesController],
  providers: [ClinicalService, VisitNotesService],
  exports: [ClinicalService, VisitNotesService],
})
export class ClinicalModule {}
