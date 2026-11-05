import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AccountType, StaffRole } from '../generated/prisma/enums.js';

/** Who is calling, as the gateway's auth check reported it (the X-User-* headers). */
export interface Caller {
  id: string;
  type: AccountType;
  roles: StaffRole[];
}

/** What `@Roles()` accepts: patients, plus each staff role. */
export type Role = 'PATIENT' | StaffRole;

export type RequestWithCaller = Request & { caller?: Caller };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_TYPES = new Set<string>(Object.values(AccountType));
const STAFF_ROLES = new Set<string>(Object.values(StaffRole));

/** Reads the identity headers. Returns null if they're missing or malformed. */
export function readCaller(headers: Request['headers']): Caller | null {
  const id = headers['x-user-id'];
  const type = headers['x-user-type'];
  const roles = headers['x-user-roles'] ?? '';
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (typeof type !== 'string' || !ACCOUNT_TYPES.has(type)) return null;
  if (typeof roles !== 'string') return null;

  const list = roles === '' ? [] : roles.split(',').map((r) => r.trim());
  if (!list.every((r) => STAFF_ROLES.has(r))) return null;
  if (type === AccountType.PATIENT && list.length > 0) return null;

  return { id, type: type as AccountType, roles: list as StaffRole[] };
}

export function hasRole(caller: Caller, role: Role): boolean {
  return role === 'PATIENT'
    ? caller.type === AccountType.PATIENT
    : caller.type === AccountType.STAFF && caller.roles.includes(role);
}

/** The caller of a route protected by `@Roles()`. */
export const CurrentCaller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Caller =>
    ctx.switchToHttp().getRequest<RequestWithCaller>().caller!,
);
