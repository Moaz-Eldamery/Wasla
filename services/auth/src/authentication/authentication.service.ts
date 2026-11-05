import { Injectable } from '@nestjs/common';
import { ApiError, unauthenticated } from '../api-error.js';
import { AuditService } from '../audit.service.js';
import { PrismaService } from '../prisma.service.js';
import { OtpService, CODE_TTL_MS } from './otp.service.js';
import { burnPasswordCheck, verifyPassword } from './password.js';
import { SessionService, type SessionUser } from './session.service.js';

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: SessionUser;
}

const invalidCredentials = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong phone number or password.');

/** Logging in and out, and confirming a patient's phone number. */
@Injectable()
export class AuthenticationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Phone and password, for patients and staff alike. Unknown phone, wrong
   * password and inactive account all give the same answer. Every attempt is audited.
   */
  async login(phone: string, password: string, ip?: string): Promise<LoginResult> {
    const account = await this.prisma.account.findUnique({
      where: { phone },
      select: {
        id: true,
        type: true,
        name: true,
        phone: true,
        roles: true,
        active: true,
        passwordHash: true,
        phoneVerifiedAt: true,
      },
    });

    if (!account) {
      await burnPasswordCheck(password);
      await this.audit.record({
        actor: null,
        action: 'auth.login',
        outcome: 'FAILED',
        ip,
        details: { reason: 'unknown_phone' },
      });
      throw invalidCredentials();
    }

    const actor = { id: account.id, type: account.type };
    const passwordOk = await verifyPassword(account.passwordHash, password);
    if (!passwordOk || !account.active) {
      await this.audit.record({
        actor,
        action: 'auth.login',
        outcome: passwordOk ? 'DENIED' : 'FAILED',
        ip,
        details: { reason: passwordOk ? 'inactive' : 'wrong_password' },
      });
      throw invalidCredentials();
    }

    if (account.type === 'PATIENT' && !account.phoneVerifiedAt) {
      await this.audit.record({
        actor,
        action: 'auth.login',
        outcome: 'DENIED',
        ip,
        details: { reason: 'phone_not_verified' },
      });
      throw new ApiError(403, 'PHONE_NOT_VERIFIED', 'Confirm your phone number first.');
    }

    const { token, expiresAt } = await this.sessions.create(account.id);
    await this.audit.record({ actor, action: 'auth.login', outcome: 'SUCCESS', ip });
    const { id, type, name, roles } = account;
    return { token, expiresAt, user: { id, type, name, phone: account.phone, roles } };
  }

  async logout(token: string | null, ip?: string): Promise<void> {
    const user = await this.sessions.revoke(token);
    if (!user) throw unauthenticated();
    await this.audit.record({
      actor: { id: user.id, type: user.type },
      action: 'auth.logout',
      outcome: 'SUCCESS',
      ip,
    });
  }

  async me(token: string | null): Promise<SessionUser> {
    const user = await this.sessions.validate(token);
    if (!user) throw unauthenticated();
    return user;
  }

  /** Confirms a patient's phone with the code sent to it. */
  async verifyPhone(phone: string, code: string, ip?: string): Promise<void> {
    const account = await this.unverifiedPatient(phone);
    // Unknown or already verified numbers look like a wrong code: nothing to learn.
    if (!account) throw new ApiError(400, 'CODE_INVALID', 'That code is not right.');

    const actor = { id: account.id, type: account.type };
    try {
      await this.otp.verify(account.id, code);
    } catch (error) {
      await this.audit.record({ actor, action: 'auth.verify_phone', outcome: 'FAILED', ip });
      throw error;
    }
    await this.prisma.account.update({
      where: { id: account.id },
      data: { phoneVerifiedAt: new Date() },
      select: { id: true },
    });
    await this.audit.record({ actor, action: 'auth.verify_phone', outcome: 'SUCCESS', ip });
  }

  /**
   * Sends a new code to an unverified patient. Unknown and verified numbers
   * get the same answer, without a code, so this doesn't reveal who is registered.
   */
  async resendCode(phone: string): Promise<{ expiresAt: Date; simulatedCode?: string }> {
    const account = await this.unverifiedPatient(phone);
    if (!account) return { expiresAt: new Date(Date.now() + CODE_TTL_MS) };
    return this.otp.send(account);
  }

  private unverifiedPatient(phone: string) {
    return this.prisma.account.findFirst({
      where: { phone, type: 'PATIENT', phoneVerifiedAt: null },
      select: { id: true, type: true, phone: true },
    });
  }
}
