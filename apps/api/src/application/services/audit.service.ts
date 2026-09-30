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
   * Recent history for one record, newest first. Most writes record only the
   * user's id, so the name is looked up here; a row with neither is the
   * system's own (an import, a migration).
   */
  async forEntity(
    entity: string,
    entityId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    const rows = await this.logs.find({
      where: { entity, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const ids = [
      ...new Set(
        rows.filter((r) => r.userId && !r.username).map((r) => r.userId!),
      ),
    ];
    if (ids.length) {
      const users = await this.logs.query<
        Array<{ id: string; username: string }>
      >(`SELECT id, username FROM users WHERE id = ANY($1::uuid[])`, [ids]);
      const names = new Map(users.map((u) => [u.id, u.username]));
      for (const row of rows) {
        if (row.userId && !row.username) {
          row.username = names.get(row.userId) ?? null;
        }
      }
    }
    return rows;
  }
}
