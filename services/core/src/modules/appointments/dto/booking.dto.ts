import {
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { DepartmentKind } from '../../../generated/prisma/enums.js';
import { isCairoDay } from '../../../shared/cairo-time.js';

@ValidatorConstraint({ name: 'cairoDay' })
class IsCairoDay implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isCairoDay(value);
  }

  defaultMessage(): string {
    return 'must be a date written as YYYY-MM-DD';
  }
}

/** Body of `POST /appointments`. */
export class BookAppointmentDto {
  @IsUUID()
  slotId: string;
}

/** Query of `GET /departments`. */
export class DepartmentsQuery {
  @IsOptional()
  @IsEnum(DepartmentKind)
  kind?: DepartmentKind;
}

/** Query of `GET /doctors/{doctorId}/slots`: Cairo days, both included. */
export class FreeSlotsQuery {
  @IsOptional()
  @Validate(IsCairoDay)
  from?: string;

  @IsOptional()
  @Validate(IsCairoDay)
  to?: string;
}

/** Query of `GET /me/appointments`. */
export class MyAppointmentsQuery {
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  when?: 'upcoming' | 'past';
}

/** A `?date=` query: one Cairo day. Defaults to today. */
export class DayQuery {
  @IsOptional()
  @Validate(IsCairoDay)
  date?: string;
}
