import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PHONE } from '../../authentication/dto/authentication.dto.js';
import { StaffRole } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Query of `GET /auth/staff`. */
export class StaffListQuery {
  /** Part of a name, work email or phone number. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

class RolesBody {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(StaffRole, { each: true })
  roles: StaffRole[];
}

/** Body of `POST /auth/staff`. */
export class NewStaffDto extends RolesBody {
  @IsString()
  @Transform(trim)
  @Length(2, 100)
  name: string;

  @IsEmail({}, { message: 'must be an email address like receptionist@hospital.eg' })
  @MaxLength(254)
  @Transform(trim)
  email: string;

  /** Optional for staff: a contact number, never a login. */
  @IsOptional()
  @Matches(PHONE, { message: 'must be an Egyptian mobile number like +201000000001' })
  phone?: string;
}

/** Body of `PUT /auth/staff/{staffId}/roles`. */
export class StaffRolesDto extends RolesBody {}
