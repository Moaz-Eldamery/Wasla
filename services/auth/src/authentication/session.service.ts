import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import type { AccountType, StaffRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma.service.js';

/** Limit from business.md ("Accounts"): log in again after this. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
/** last_seen_at is only rewritten when it's older than this, to spare the database. */
const TOUCH_AFTER_MS = 60_000;

export interface SessionUser {
  id: string;
  type: AccountType;
  name: string;
  phone: string;
  roles: StaffRole[];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  const match = header && /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(header);
  return match ? match[1] : null;
}

/**
 * Login sessions. The client holds a random token; only its SHA-256 hash is
 * stored, so a database leak doesn't hand out sessions.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    accountId: string,
    now: Date = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: { accountId, tokenHash: hashToken(token), createdAt: now, lastSeenAt: now, expiresAt },
      select: { id: true },
    });
    return { token, expiresAt };
  }

  /**
   * The user behind a token, or null if the session doesn't exist, expired,
   * was revoked, or the account is no longer active.
   */
  async validate(token: string | null, now: Date = new Date()): Promise<SessionUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        account: {
          select: { id: true, type: true, name: true, phone: true, roles: true, active: true },
        },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= now || !session.account.active) {
      return null;
    }

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
        select: { id: true },
      });
    }
    const { active: _active, ...user } = session.account;
    return user;
  }

  /** Ends one session. Returns the account it belonged to, if it was live. */
  async revoke(token: string | null, now: Date = new Date()): Promise<SessionUser | null> {
    const user = await this.validate(token, now);
    if (!user || !token) return null;
    await this.prisma.session.update({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: now },
      select: { id: true },
    });
    return user;
  }
}
