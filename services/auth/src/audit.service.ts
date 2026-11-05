import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from './generated/prisma/client.js';
import type { AccountType, AuditOutcome } from './generated/prisma/enums.js';
import { PrismaService } from './prisma.service.js';

export interface AuditEntry {
  actor: { id: string; type: AccountType } | null;
  /** Dotted name, e.g. `auth.login`. */
  action: string;
  entityType?: string;
  entityId?: string;
  outcome: AuditOutcome;
  ip?: string;
  /** Extra context. Never names, phone numbers, passwords or codes. */
  details?: Prisma.InputJsonObject;
}

/** The client's IP: the first X-Forwarded-For entry (set by the gateway), else the socket's. */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip;
}

/**
 * Writes login events to core.audit_log, the same log the core uses.
 * wasla_auth may only INSERT there (no SELECT), so this uses createMany,
 * which doesn't read the row back.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.createMany({
      data: [
        {
          actorId: entry.actor?.id ?? null,
          actorType: entry.actor?.type ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          outcome: entry.outcome,
          ip: entry.ip,
          details: entry.details,
        },
      ],
    });
  }
}
