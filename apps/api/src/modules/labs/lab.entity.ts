import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A dental lab the practice sends work to. The practice adds and drops labs
 * over time, so this is a catalogue managed from Settings rather than an enum;
 * a lab no longer used is deactivated, never deleted, so its old cases still
 * name it.
 */
@Entity('labs')
export class Lab {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  /** Persian-folded `name`, so «راه پیما» and «راه‌پیما» are one lab. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  normalizedName!: string;

  /** Inactive labs stay on their cases but are not offered for new ones. */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** The order the form offers labs in: the seeded ones as the practice listed them, new ones after. */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
