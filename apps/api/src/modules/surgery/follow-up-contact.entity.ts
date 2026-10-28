import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ContactOutcome } from '../../domain';
import { User } from '../users/user.entity';
import { SurgeryQueueItem } from './surgery-queue-item.entity';

/**
 * One call about a follow-up: what it came to, who made it and when. Never
 * edited — the next call is a new row — so the card can say "no answer
 * Saturday, Ms A" and nobody rings the patient three times in a week.
 */
@Entity('follow_up_contacts')
@Index('idx_follow_up_contacts_surgery', ['surgeryId', 'createdAt'])
export class FollowUpContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  surgeryId!: string;

  // Pairs with `surgeryId`. With this relation loaded, save() takes the id from it
  // and ignores a changed `surgeryId` — set both, or drop the relation (CLAUDE.md).
  @ManyToOne(() => SurgeryQueueItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'surgeryId' })
  surgery!: SurgeryQueueItem;

  @Column({
    type: 'enum',
    enum: ContactOutcome,
    enumName: 'follow_up_contacts_outcome_enum',
  })
  outcome!: ContactOutcome;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  /** The day this call said to call again, kept as it was said. */
  @Column({ type: 'date', nullable: true })
  nextContactAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  // Pairs with `userId`. With this relation loaded, save() takes the id from it
  // and ignores a changed `userId` — set both, or drop the relation (CLAUDE.md).
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
