import { IsString, Matches, MaxLength } from 'class-validator';

/** Egyptian mobile number in E.164 form (the contract's `Phone`). */
export const PHONE = /^\+201[0-9]{9}$/;

/** Body of `POST /auth/login`. */
export class LoginDto {
  @Matches(PHONE, { message: 'must be an Egyptian mobile number like +201000000001' })
  phone: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

/** Body of `POST /auth/verify-phone`. */
export class VerifyPhoneDto {
  @Matches(PHONE, { message: 'must be an Egyptian mobile number like +201000000001' })
  phone: string;

  @Matches(/^[0-9]{6}$/, { message: 'must be 6 digits' })
  code: string;
}

/** Body of `POST /auth/resend-code`. */
export class ResendCodeDto {
  @Matches(PHONE, { message: 'must be an Egyptian mobile number like +201000000001' })
  phone: string;
}
