import { ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isCairoDay } from './cairo-time.js';

/** `@Validate(IsCairoDay)`: a real calendar day written as `YYYY-MM-DD`. */
@ValidatorConstraint({ name: 'cairoDay' })
export class IsCairoDay implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isCairoDay(value);
  }

  defaultMessage(): string {
    return 'must be a date written as YYYY-MM-DD';
  }
}
