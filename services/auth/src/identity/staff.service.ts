import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ApiError, forbidden, unauthenticated } from '../api-error.js';
import { AuditService } from '../audit.service.js';
import { hashPassword } from '../authentication/password.js';
import { SessionService, type SessionUser } from '../authentication/session.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { StaffRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma.service.js';

/** A staff account as the contract shows it (`StaffMember`). */
export interface StaffMemberView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: StaffRole[];
  active: boolean;
  createdAt: Date;
}

export interface NewStaff {
  name: string;
  email: string;
  phone?: string;
  roles: StaffRole[];
}

const staffSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  roles: true,
  active: true,
  createdAt: true,
} satisfies Prisma.AccountSelect;

type StaffRow = Prisma.AccountGetPayload<{ select: typeof staffSelect }>;

/** The order the screens list roles in. */
const ROLE_ORDER: StaffRole[] = ['RECEPTIONIST', 'DOCTOR', 'LAB', 'ADMIN'];

/** Roles are stored in the screen order too, so the auth check reports them the same way. */
const inOrder = (roles: StaffRole[]) => ROLE_ORDER.filter((r) => roles.includes(r));

function toView(row: StaffRow): StaffMemberView {
  return {
    ...row,
    // A staff account always has an email (database check accounts_login_identifier).
    email: row.email ?? '',
    roles: inOrder(row.roles),
  };
}

const notFound = () => new ApiError(404, 'NOT_FOUND', 'No such staff member.');
const emailTaken = () =>
  new ApiError(409, 'EMAIL_TAKEN', 'This work email already has an account.');
const phoneTaken = () =>
  new ApiError(409, 'PHONE_TAKEN', 'This phone number already has an account.');

/**
 * Letters and digits that can't be mistaken for each other when read aloud or
 * copied by hand (no 0/O, 1/l/I).
 */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A temporary password like `k7Qm-x2Rt-Hb9w`: 12 random characters, about 69 bits. */
export function temporaryPassword(): string {
  const chars = Array.from({ length: 12 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]);
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/**
 * Staff accounts, managed by an admin (KAN-36). Business rules ("Accounts"):
 * the temporary password is returned once and only its hash is kept;
 * deactivating revokes every session at once; an admin can't deactivate
 * themselves or drop their own admin role. Every change is audited.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The signed-in admin behind a token. These routes come through the gateway
   * without its auth check (all of /auth/* does), so they check it here.
   */
  async requireAdmin(token: string | null, path: string, ip?: string): Promise<SessionUser> {
    const user = await this.sessions.validate(token);
    if (!user) throw unauthenticated();
    if (user.type !== 'STAFF' || !user.roles.includes('ADMIN')) {
      await this.audit.record({
        actor: { id: user.id, type: user.type },
        action: 'access.forbidden',
        outcome: 'DENIED',
        ip,
        details: { path },
      });
      throw forbidden();
    }
    return user;
  }

  /** Every staff account, sorted by name. `q` matches name, email or phone. */
  async list(q?: string, status?: 'active' | 'inactive'): Promise<StaffMemberView[]> {
    const where: Prisma.AccountWhereInput = { type: 'STAFF' };
    if (status) where.active = status === 'active';
    if (q) {
      const digits = q.replace(/[^\d+]/g, '');
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q.toLowerCase() } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ];
    }
    const rows = await this.prisma.account.findMany({
      where,
      select: staffSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toView);
  }

  /** Creates an active staff account. The temporary password is returned here only. */
  async create(
    admin: SessionUser,
    input: NewStaff,
    ip?: string,
  ): Promise<{ staff: StaffMemberView; temporaryPassword: string }> {
    const email = input.email.trim().toLowerCase();
    const phone = input.phone || null;
    await this.ensureFree(email, phone);

    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    let row: StaffRow;
    try {
      row = await this.prisma.account.create({
        data: { type: 'STAFF', name: input.name.trim(), email, phone, roles: inOrder(input.roles), passwordHash },
        select: staffSelect,
      });
    } catch (error) {
      // Someone took the email or phone between the check and the insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this.ensureFree(email, phone);
      }
      throw error;
    }

    await this.record(admin, 'staff.create', row.id, ip, { roles: row.roles });
    return { staff: toView(row), temporaryPassword: password };
  }

  /** Replaces a staff member's roles. An admin can't drop their own admin role. */
  async setRoles(
    admin: SessionUser,
    staffId: string,
    roles: StaffRole[],
    ip?: string,
  ): Promise<StaffMemberView> {
    await this.findStaff(staffId);
    if (staffId === admin.id && !roles.includes('ADMIN')) {
      await this.record(admin, 'staff.roles', staffId, ip, { reason: 'own_admin_role' }, 'DENIED');
      throw new ApiError(403, 'FORBIDDEN', "You can't remove your own Admin role.");
    }
    const row = await this.prisma.account.update({
      where: { id: staffId },
      data: { roles: inOrder(roles) },
      select: staffSelect,
    });
    await this.record(admin, 'staff.roles', staffId, ip, { roles: row.roles });
    return toView(row);
  }

  /**
   * Deactivates or reactivates a staff member. Deactivating revokes every
   * open session in the same transaction, so their next request gets 401.
   * Doing it twice is harmless. An admin can't deactivate themselves.
   */
  async setActive(
    admin: SessionUser,
    staffId: string,
    active: boolean,
    ip?: string,
  ): Promise<StaffMemberView> {
    await this.findStaff(staffId);
    const action = active ? 'staff.reactivate' : 'staff.deactivate';
    if (!active && staffId === admin.id) {
      await this.record(admin, action, staffId, ip, { reason: 'own_account' }, 'DENIED');
      throw new ApiError(403, 'FORBIDDEN', "You can't deactivate your own account.");
    }

    const now = new Date();
    const [row, revoked] = await this.prisma.$transaction([
      this.prisma.account.update({ where: { id: staffId }, data: { active }, select: staffSelect }),
      ...(active
        ? []
        : [
            this.prisma.session.updateMany({
              where: { accountId: staffId, revokedAt: null, expiresAt: { gt: now } },
              data: { revokedAt: now },
            }),
          ]),
    ]);
    await this.record(admin, action, staffId, ip, active ? undefined : { sessionsRevoked: revoked?.count ?? 0 });
    return toView(row as StaffRow);
  }

  private async findStaff(staffId: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: staffId },
      select: { type: true },
    });
    if (account?.type !== 'STAFF') throw notFound();
  }

  /** EMAIL_TAKEN or PHONE_TAKEN when another account (staff or patient) has them. */
  private async ensureFree(email: string, phone: string | null): Promise<void> {
    const taken = await this.prisma.account.findMany({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
      select: { email: true, phone: true },
    });
    if (taken.some((a) => a.email === email)) throw emailTaken();
    if (phone && taken.some((a) => a.phone === phone)) throw phoneTaken();
  }

  private record(
    admin: SessionUser,
    action: string,
    staffId: string,
    ip: string | undefined,
    details?: Prisma.InputJsonObject,
    outcome: 'SUCCESS' | 'DENIED' = 'SUCCESS',
  ): Promise<void> {
    return this.audit.record({
      actor: { id: admin.id, type: admin.type },
      action,
      entityType: 'account',
      entityId: staffId,
      outcome,
      ip,
      details,
    });
  }
}
