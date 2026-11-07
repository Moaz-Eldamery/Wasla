import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../api-error.js';
import { clientIp } from '../audit.service.js';
import type { SessionUser } from '../authentication/session.service.js';
import { AdminGuard, CurrentAdmin } from './admin.guard.js';
import { NewStaffDto, StaffListQuery, StaffRolesDto } from './dto/staff.dto.js';
import { StaffService } from './staff.service.js';

/** A malformed ID can't exist, so it's a 404. */
const StaffIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiError(404, 'NOT_FOUND', 'No such staff member.'),
});

/** Staff accounts, for admins only (`x-roles: [ADMIN]`). */
@Controller('staff')
@UseGuards(AdminGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@Query() query: StaffListQuery) {
    return this.staff.list(query.q, query.status);
  }

  @Post()
  create(@CurrentAdmin() admin: SessionUser, @Body() body: NewStaffDto, @Req() req: Request) {
    return this.staff.create(admin, body, clientIp(req));
  }

  @Put(':staffId/roles')
  setRoles(
    @CurrentAdmin() admin: SessionUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Body() body: StaffRolesDto,
    @Req() req: Request,
  ) {
    return this.staff.setRoles(admin, staffId, body.roles, clientIp(req));
  }

  @Post(':staffId/deactivate')
  @HttpCode(200)
  deactivate(
    @CurrentAdmin() admin: SessionUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Req() req: Request,
  ) {
    return this.staff.setActive(admin, staffId, false, clientIp(req));
  }

  @Post(':staffId/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentAdmin() admin: SessionUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Req() req: Request,
  ) {
    return this.staff.setActive(admin, staffId, true, clientIp(req));
  }
}
