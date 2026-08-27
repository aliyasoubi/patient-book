import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  /**
   * Append an audit entry. Deliberately never throws: losing an audit line is
   * bad, but failing the clinical operation that produced it is worse.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const row = this.logs.create({
        userId: entry.userId,
        username: entry.username ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        changes: entry.changes ?? null,
        ip: entry.ip ?? null,
      });
      await this.logs.save(row);
    } catch (err) {
      this.logger.error(`Failed to write audit entry for ${entry.entity}`, err as Error);
    }
  }

  /** Recent history for one record, newest first. */
  async forEntity(entity: string, entityId: string, limit = 50): Promise<AuditLog[]> {
    return this.logs.find({
      where: { entity, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
