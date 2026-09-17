import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Who changed what, and to what. Append-only. */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', length: 16 })
  action!:
    | 'create'
    | 'update'
    | 'delete'
    | 'restore'
    | 'login'
    | 'login_failed'
    /** A bulk PII extract of the whole register — the `export` terminal tool. */
    | 'export';

  @Index()
  @Column({ type: 'varchar', length: 48 })
  entity!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  entityId!: string | null;

  /** `{ field: { from, to } }` for updates; the full snapshot for creates. */
  @Column({ type: 'jsonb', nullable: true })
  changes!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
