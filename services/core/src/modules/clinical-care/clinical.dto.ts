import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { TestStatus } from '../../generated/prisma/enums.js';

export class OrderTestDto {
  @IsUUID()
  clinicId: string;

  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  testName: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string | null;
}

export class LabTestsQuery {
  @IsOptional()
  @IsEnum(TestStatus)
  status?: TestStatus;
}
