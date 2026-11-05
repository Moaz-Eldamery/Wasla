import { IsString, Length, Matches } from 'class-validator';
import { PHONE } from '../../authentication/dto/authentication.dto.js';

/** Body of `POST /auth/register`. */
export class RegisterDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @Matches(PHONE, { message: 'must be an Egyptian mobile number like +201000000001' })
  phone: string;

  @IsString()
  @Length(8, 128)
  password: string;
}
