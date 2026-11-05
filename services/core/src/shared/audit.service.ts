import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuditOutcome } from '../generated/prisma/enums.js';
import type { Caller } from './caller.js';
import { PrismaService } from './prisma.service.js';

export interface AuditEntry {
  caller: Caller | null;
  /** Dotted name, e.g. `appointment.book`. */
  action: string;
  entityType?: string;
  entityId?: string;
  outcome: AuditOutcome;
  /** Extra context. Never names, phone numbers or medical content. */
  details?: Prisma.InputJsonObject;
}

/** Writes to core.audit_log, which is append-only (see schema.md). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `db` to write inside a transaction, so the entry commits with the change. */
  async record(
    entry: AuditEntry,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId: entry.caller?.id ?? null,
        actorType: entry.caller?.type ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        outcome: entry.outcome,
        details: entry.details,
      },
    });
  }
}
