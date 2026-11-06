import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

/** A full new snapshot, based on the version the doctor last read. */
export class SaveVisitNotesDto {
  @IsInt()
  @Min(0)
  baseVersion: number;

  @IsString()
  @Length(1, 20000)
  clinicalNotes: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  patientSummary?: string | null;
}
