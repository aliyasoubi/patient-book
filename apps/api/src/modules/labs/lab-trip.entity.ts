import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { LabTripKind } from '../../domain';
import { LabCase } from './lab-case.entity';

/**
 * One trip of a case to the lab and back: what it went for, when it left,
 * when it is due back and when it came back.
 *
 * A case has at most one trip out at a time — a partial unique index on
 * `labCaseId` where `receivedAt` is null holds that in the database, so two
 * people sending the same case at once cannot both succeed.
 */
@Entity('lab_case_trips')
@Index(['labCaseId', 'sequence'], { unique: true })
export class LabTrip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  labCaseId!: string;

  @ManyToOne(() => LabCase, (c) => c.trips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labCaseId' })
  labCase!: LabCase;

  /** 1 for the first trip, counting up: «رفت ۲» on the card. */
  @Column({ type: 'smallint' })
  sequence!: number;

  @Column({ type: 'enum', enum: LabTripKind })
  kind!: LabTripKind;

  @Column({ type: 'date' })
  sentAt!: Date;

  /**
   * How long the lab said it would take, in days. The book wrote «یک هفته» or
   * «سه هفته»; the form offers weeks and stores days.
   */
  @Column({ type: 'smallint' })
  waitDays!: number;

  /** `sentAt` plus `waitDays`; recomputed when either changes. */
  @Column({ type: 'date' })
  expectedAt!: Date;

  /** Back at the clinic. Null while the work is at the lab. */
  @Column({ type: 'date', nullable: true })
  receivedAt!: Date | null;

  /** What this trip was for, in a word: «رنگ»، «تماس پروگزیمال». */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
