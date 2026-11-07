import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AccountType, AuditOutcome } from '../../generated/prisma/enums.js';
import { ApiError } from '../../shared/api-error.js';
import { addDays, startOfCairoDay } from '../../shared/cairo-time.js';
import { PrismaService } from '../../shared/prisma.service.js';
import {
  auditActionWhere,
  toAuditAction,
  toAuditEntityType,
  type AuditAction,
  type AuditEntityType,
} from './audit-actions.js';

export const AUDIT_PAGE_SIZE = 50;

/** The contract's `AuditEntry`. No details column: it is never shown on screen. */
export interface AuditEntryView {
  id: string;
  occurredAt: Date;
  actor: { id: string; name: string; type: AccountType } | null;
  action: AuditAction;
  outcome: AuditOutcome;
  entityType: AuditEntityType | null;
  entityId: string | null;
  ip: string | null;
}

export interface AuditFilter {
  who?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  cursor?: string;
}

/**
 * IAdmin: reading the audit log (KAN-62). Read-only: the table refuses
 * updates and deletes anyway. Newest first, 50 at a time, paged by id.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async search(filter: AuditFilter): Promise<{ entries: AuditEntryView[]; nextCursor: string | null }> {
    if (filter.from && filter.to && filter.from > filter.to) {
      throw new ApiError(400, 'VALIDATION_FAILED', '`to` must be on or after `from`.', [
        { field: 'to', problem: 'before from' },
      ]);
    }

    const where: Prisma.AuditLogWhereInput[] = [];
    if (filter.who) {
      const digits = filter.who.replace(/[^\d+]/g, '');
      where.push({
        actor: {
          OR: [
            { name: { contains: filter.who, mode: 'insensitive' } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          ],
        },
      });
    }
    if (filter.action) where.push(auditActionWhere(filter.action));
    if (filter.from) where.push({ occurredAt: { gte: startOfCairoDay(filter.from) } });
    if (filter.to) where.push({ occurredAt: { lt: startOfCairoDay(addDays(filter.to, 1)) } });
    if (filter.cursor) where.push({ id: { lt: BigInt(filter.cursor) } });

    const rows = await this.prisma.auditLog.findMany({
      where: { AND: where },
      select: {
        id: true,
        occurredAt: true,
        action: true,
        outcome: true,
        entityType: true,
        entityId: true,
        ip: true,
        // Only columns wasla_core may read on auth.accounts (schema.md).
        actor: { select: { id: true, name: true, type: true } },
      },
      orderBy: { id: 'desc' },
      take: AUDIT_PAGE_SIZE + 1,
    });

    const page = rows.slice(0, AUDIT_PAGE_SIZE);
    return {
      entries: page.map((r) => ({
        id: r.id.toString(),
        occurredAt: r.occurredAt,
        actor: r.actor,
        action: toAuditAction(r.action, r.outcome),
        outcome: r.outcome,
        entityType: toAuditEntityType(r.entityType),
        entityId: r.entityId,
        ip: r.ip,
      })),
      nextCursor: rows.length > AUDIT_PAGE_SIZE ? page[page.length - 1].id.toString() : null,
    };
  }
}
