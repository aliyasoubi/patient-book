import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../../infrastructure/persistence/entities/audit-log.entity';

export interface AuditEntry {
  userId: string | null;
  username?: string | null;
  action: AuditLog['action'];
  entity: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
  ip?: string | null;
}

/** A history row as the patient screen shows it: who, by the name they go by. */
export type AuditHistoryEntry = AuditLog & { fullName: string | null };

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  /**
   * Write an audit row as part of a required operation.
   *
   * Passing the caller's transaction manager makes the business change and
   * its audit record commit or roll back together. Unlike {@link record}, this
   * method deliberately propagates persistence failures.
   */
  async recordRequired(
    entry: AuditEntry,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(AuditLog) ?? this.logs;
    const row = repository.create({
      userId: entry.userId,
      username: entry.username ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      changes: entry.changes ?? null,
      ip: entry.ip ?? null,
    });
    await repository.save(row);
  }

  /**
   * Append an audit entry. Deliberately never throws: losing an audit line is
   * bad, but failing the clinical operation that produced it is worse.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.recordRequired(entry);
    } catch (err) {
      this.logger.error(
        `Failed to write audit entry for ${entry.entity}`,
        err as Error,
      );
    }
  }

  /**
   * Recent history for one record, newest first, with the name staff know
   * each author by. Most writes record only the user's id, so the names are
   * looked up here; a row with no user is the system's own (an import, a
   * migration). A user since removed keeps whatever username the row stored.
   */
  async forEntity(
    entity: string,
    entityId: string,
    limit = 50,
  ): Promise<AuditHistoryEntry[]> {
    const rows = await this.logs.find({
      where: { entity, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const ids = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
    const users = ids.length
      ? await this.logs.query<
          Array<{ id: string; username: string; fullName: string | null }>
        >(
          `SELECT id, username, "fullName" FROM users WHERE id = ANY($1::uuid[])`,
          [ids],
        )
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((row) => {
      const user = row.userId ? byId.get(row.userId) : undefined;
      return Object.assign(row, {
        username: row.username ?? user?.username ?? null,
        fullName: user?.fullName?.trim() || null,
      });
    });
  }
}
