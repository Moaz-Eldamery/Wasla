import { Injectable } from '@nestjs/common';
import { ApiError } from '../api-error.js';
import { AuditService } from '../audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { OtpService, type SentCode } from '../authentication/otp.service.js';
import { hashPassword } from '../authentication/password.js';
import { PrismaService } from '../prisma.service.js';

const phoneTaken = () =>
  new ApiError(409, 'PHONE_TAKEN', 'This phone number already has an account.');

/** Accounts. Patients register themselves; staff accounts come from an admin (KAN-36). */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates an unverified patient and sends a code. A number whose earlier
   * sign-up was never verified starts over with the new name and password;
   * a verified number (or a staff one) is taken.
   */
  async registerPatient(
    name: string,
    phone: string,
    password: string,
    ip?: string,
  ): Promise<SentCode> {
    const existing = await this.prisma.account.findUnique({
      where: { phone },
      select: { id: true, type: true, phoneVerifiedAt: true },
    });
    if (existing && (existing.type !== 'PATIENT' || existing.phoneVerifiedAt)) {
      throw phoneTaken();
    }

    const passwordHash = await hashPassword(password);
    let account: { id: string; phone: string };
    try {
      account = existing
        ? await this.prisma.account.update({
            where: { id: existing.id },
            data: { name, passwordHash },
            select: { id: true, phone: true },
          })
        : await this.prisma.account.create({
            data: { type: 'PATIENT', name, phone, passwordHash },
            select: { id: true, phone: true },
          });
    } catch (error) {
      // Two sign-ups for the same number at once: the second one loses.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw phoneTaken();
      }
      throw error;
    }

    await this.audit.record({
      actor: { id: account.id, type: 'PATIENT' },
      action: 'auth.register',
      outcome: 'SUCCESS',
      ip,
      details: { restarted: Boolean(existing) },
    });
    return this.otp.send(account);
  }
}
