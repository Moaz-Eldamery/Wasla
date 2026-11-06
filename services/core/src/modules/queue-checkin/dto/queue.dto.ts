import { IsUUID } from 'class-validator';

/** Body of `POST /doctors/me/queue/call-next`. */
export class CallNextDto {
  @IsUUID()
  clinicId: string;
}
