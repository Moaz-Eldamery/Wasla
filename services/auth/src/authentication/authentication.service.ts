import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { AccountType } from '../generated/prisma/enums.js';
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

const invalidCredentials = (identifier: 'phone number' | 'email') =>
  new ApiError(401, 'INVALID_CREDENTIALS', `Wrong ${identifier} or password.`);

/** What a login reads from auth.accounts. */
const loginSelect = {
  id: true,
  type: true,
  name: true,
  phone: true,
  email: true,
  roles: true,
  active: true,
  passwordHash: true,
  phoneVerifiedAt: true,
} satisfies Prisma.AccountSelect;

type LoginAccount = Prisma.AccountGetPayload<{ select: typeof loginSelect }>;

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
   * Patients, from the app: phone and password. A staff account's phone
   * doesn't log in here; staff use `staffLogin` from the website.
   */
  async login(phone: string, password: string, ip?: string): Promise<LoginResult> {
    const account = await this.prisma.account.findUnique({
      where: { phone },
      select: loginSelect,
    });
    return this.authenticate(account, 'PATIENT', password, ip);
  }

  /**
   * Staff, from the website: work email and password. Emails are stored
   * lowercase, so the address is matched without regard to case.
   */
  async staffLogin(email: string, password: string, ip?: string): Promise<LoginResult> {
    const account = await this.prisma.account.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: loginSelect,
    });
    return this.authenticate(account, 'STAFF', password, ip);
  }

  /**
   * The checks both logins share. Unknown account, an account of the other
   * kind, wrong password and inactive account all give the same answer, so a
   * login never reveals who is registered. Every attempt is audited.
   */
  private async authenticate(
    account: LoginAccount | null,
    expected: AccountType,
    password: string,
    ip?: string,
  ): Promise<LoginResult> {
    const identifier = expected === 'PATIENT' ? 'phone number' : 'email';
    if (!account) {
      await burnPasswordCheck(password);
      await this.audit.record({
        actor: null,
        action: 'auth.login',
        outcome: 'FAILED',
        ip,
        details: { reason: expected === 'PATIENT' ? 'unknown_phone' : 'unknown_email' },
      });
      throw invalidCredentials(identifier);
    }

    const actor = { id: account.id, type: account.type };
    const passwordOk = await verifyPassword(account.passwordHash, password);
    const reason = !passwordOk
      ? 'wrong_password'
      : account.type !== expected
        ? 'wrong_app'
        : !account.active
          ? 'inactive'
          : null;
    if (reason) {
      await this.audit.record({
        actor,
        action: 'auth.login',
        outcome: passwordOk ? 'DENIED' : 'FAILED',
        ip,
        details: { reason },
      });
      throw invalidCredentials(identifier);
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
    const { id, type, name, phone, email, roles } = account;
    return { token, expiresAt, user: { id, type, name, phone, email, roles } };
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
    return this.otp.send({ id: account.id, phone });
  }

  private unverifiedPatient(phone: string) {
    return this.prisma.account.findFirst({
      where: { phone, type: 'PATIENT', phoneVerifiedAt: null },
      select: { id: true, type: true },
    });
  }
}
