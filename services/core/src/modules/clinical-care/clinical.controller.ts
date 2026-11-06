import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IdPipe } from '../../shared/api-error.js';
import { CurrentCaller, type Caller } from '../../shared/caller.js';
import { Roles } from '../../shared/roles.guard.js';
import { LabTestsQuery, OrderTestDto } from './clinical.dto.js';
import { ClinicalService } from './clinical.service.js';
import { MAX_RESULT_BYTES, type ResultUpload } from './result-upload.js';

@Controller()
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Get('appointments/:appointmentId/tests')
  @Roles('DOCTOR')
  listVisit(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) id: string,
  ) {
    return this.clinical.listVisitTests(caller, id);
  }

  @Post('appointments/:appointmentId/tests')
  @Roles('DOCTOR')
  order(
    @CurrentCaller() caller: Caller,
    @Param('appointmentId', IdPipe) id: string,
    @Body() input: OrderTestDto,
  ) {
    return this.clinical.orderTest(caller, id, input);
  }

  @Get('lab/tests')
  @Roles('LAB')
  listLab(@CurrentCaller() caller: Caller, @Query() query: LabTestsQuery) {
    return this.clinical.listLabTests(caller, query.status);
  }

  @Post('tests/:testId/start')
  @HttpCode(200)
  @Roles('LAB')
  start(@CurrentCaller() caller: Caller, @Param('testId', IdPipe) id: string) {
    return this.clinical.startTest(caller, id);
  }

  @Post('tests/:testId/result')
  @HttpCode(200)
  @Roles('LAB')
  // Multer may signal its limit when it reaches the exact byte count. Leave
  // one byte for the service's inclusive 10 MB check.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_RESULT_BYTES + 1, files: 1, fields: 0 },
    }),
  )
  upload(
    @CurrentCaller() caller: Caller,
    @Param('testId', IdPipe) id: string,
    @UploadedFile() file?: ResultUpload,
  ) {
    return this.clinical.uploadResult(caller, id, file);
  }

  @Post('tests/:testId/release')
  @HttpCode(200)
  @Roles('DOCTOR')
  release(
    @CurrentCaller() caller: Caller,
    @Param('testId', IdPipe) id: string,
  ) {
    return this.clinical.releaseResult(caller, id);
  }

  @Get('tests/:testId/result/file')
  @Roles('PATIENT', 'DOCTOR', 'LAB')
  async download(
    @CurrentCaller() caller: Caller,
    @Param('testId', IdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, file } = await this.clinical.downloadResult(caller, id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const name = encodeURIComponent(file.fileName).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new StreamableFile(stream, {
      type: file.contentType,
      length: file.sizeBytes,
      disposition: `attachment; filename="result"; filename*=UTF-8''${name}`,
    });
  }

  @Get('me/results')
  @Roles('PATIENT')
  mine(
    @CurrentCaller() caller: Caller,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.clinical.listMyResults(caller);
  }
}
