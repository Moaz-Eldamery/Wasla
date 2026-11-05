import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { ApiError, rateLimited } from '../api-error.js';
import { PrismaService } from '../prisma.service.js';

/** Limits from business.md ("Accounts"). */
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_WRONG_GUESSES = 5;
export const MAX_CODES_PER_HOUR = 3;
const HOUR_MS = 60 * 60_000;

export interface SentCode {
  expiresAt: Date;
  /** Prototype only: SMS is simulated, so the app shows the code on screen. */
  simulatedCode: string;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Only the last digits, so logs don't hold whole phone numbers. */
function maskPhone(phone: string): string {
  return `…${phone.slice(-3)}`;
}

/**
 * 6-digit phone verification codes. SMS is simulated: the code is logged and
 * returned to the app instead of being sent. Only a hash is stored.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger('SimulatedSms');

  constructor(private readonly prisma: PrismaService) {}

  /** Creates and "sends" a new code. At most MAX_CODES_PER_HOUR per account. */
  async send(account: { id: string; phone: string }, now: Date = new Date()): Promise<SentCode> {
    const recent = await this.prisma.otpCode.findMany({
      where: {
        accountId: account.id,
        purpose: 'PHONE_VERIFICATION',
        createdAt: { gt: new Date(now.getTime() - HOUR_MS) },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (recent.length >= MAX_CODES_PER_HOUR) {
      const freesUpAt = recent[0].createdAt.getTime() + HOUR_MS;
      throw rateLimited(Math.ceil((freesUpAt - now.getTime()) / 1000));
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    await this.prisma.otpCode.create({
      data: {
        accountId: account.id,
        purpose: 'PHONE_VERIFICATION',
        codeHash: hashCode(code),
        createdAt: now,
        expiresAt,
      },
      select: { id: true },
    });

    this.logger.log(`Verification code for ${maskPhone(account.phone)}: ${code}`);
    return { expiresAt, simulatedCode: code };
  }

  /**
   * Checks a code against the account's latest one. A wrong guess counts
   * toward MAX_WRONG_GUESSES; after that, or after it expires, a new code is needed.
   */
  async verify(accountId: string, code: string, now: Date = new Date()): Promise<void> {
    const latest = await this.prisma.otpCode.findFirst({
      where: { accountId, purpose: 'PHONE_VERIFICATION', consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, attempts: true, expiresAt: true },
    });
    if (!latest || latest.expiresAt <= now || latest.attempts >= MAX_WRONG_GUESSES) {
      throw new ApiError(400, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.');
    }

    const matches = timingSafeEqual(
      Buffer.from(latest.codeHash, 'hex'),
      Buffer.from(hashCode(code), 'hex'),
    );
    if (!matches) {
      await this.prisma.otpCode.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
        select: { id: true },
      });
      throw new ApiError(400, 'CODE_INVALID', 'That code is not right.');
    }

    await this.prisma.otpCode.update({
      where: { id: latest.id },
      data: { consumedAt: now },
      select: { id: true },
    });
  }
}
