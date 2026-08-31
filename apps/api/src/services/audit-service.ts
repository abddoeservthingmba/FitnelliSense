/**
 * Admin audit trail (FR-ADM-08). Append-only: who did what, to which entity,
 * with the diff and the correlation id that ties it to the request logs.
 */
import { adminAuditLog } from '../db/schema';
import type { Database } from '../db/client';

export interface AuditEntry {
  readonly actorId: string;
  /** Dotted verb, e.g. `exercise.update` or `media.takedown`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly diff?: unknown;
  readonly requestId?: string;
}

export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(adminAuditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    diff: entry.diff ?? null,
    requestId: entry.requestId ?? null,
  });
}
