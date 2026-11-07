import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import { DepartmentKind } from '../../generated/prisma/enums.js';
import { IsCairoDay } from '../../shared/validators.js';
import { AUDIT_ACTIONS, type AuditAction } from './audit-actions.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** `{ ar, en }`, both filled in (the contract's `RequiredText`). */
export class RequiredTextDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  ar: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  en: string;
}

/** Body of `PUT /admin/departments/{departmentId}`. */
export class DepartmentNameDto {
  @ValidateNested()
  @Type(() => RequiredTextDto)
  name: RequiredTextDto;
}

/** Body of `POST /admin/departments`. */
export class NewDepartmentDto extends DepartmentNameDto {
  @IsEnum(DepartmentKind)
  kind: DepartmentKind;
}

/** Body of `POST /admin/departments/{id}/clinics` and `PUT /admin/clinics/{id}`. */
export class ClinicDto {
  @ValidateNested()
  @Type(() => RequiredTextDto)
  name: RequiredTextDto;

  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(40)
  building: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(40)
  floor: string;

  @ValidateNested()
  @Type(() => RequiredTextDto)
  directions: RequiredTextDto;
}

/** Query of `GET /admin/statistics`. */
export class StatisticsQuery {
  @Validate(IsCairoDay)
  from: string;

  @Validate(IsCairoDay)
  to: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

/** Query of `GET /admin/audit-log`. */
export class AuditLogQuery {
  /** Part of the actor's name or phone number. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  who?: string;

  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction;

  @IsOptional()
  @Validate(IsCairoDay)
  from?: string;

  @IsOptional()
  @Validate(IsCairoDay)
  to?: string;

  /** `nextCursor` from the previous page: the id of its last entry. */
  @IsOptional()
  @Matches(/^[1-9][0-9]{0,18}$/, { message: 'must be a nextCursor from an earlier page' })
  cursor?: string;
}
