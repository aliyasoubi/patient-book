import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { LabJaw, LabWorkType } from '../../domain';
import { Patient } from '../patients/patient.entity';
import { Lab } from './lab.entity';
import { LabTrip } from './lab-trip.entity';

/**
 * One piece of lab work for one patient — a crown, a set of laminates — from
 * the first impression until it is fitted.
 *
 * Where the work is now is never stored: it is delivered once `deliveredAt` is
 * set, at the lab while a trip is out, and back at the clinic otherwise (see
 * `lab-stage.ts`). Every move writes a trip or a date, so the board cannot
 * disagree with the history it is drawn from.
 */
@Entity('lab_cases')
export class LabCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  patientId!: string | null;

  @ManyToOne(() => Patient, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'patientId' })
  patient!: Patient | null;

  /**
   * The name as staff wrote it. Filled from the patient file when one is
   * picked, and kept even then, as every other register does.
   */
  @Column({ type: 'varchar', length: 160, default: '' })
  recordedName!: string;

  @Index()
  @Column({ type: 'uuid' })
  labId!: string;

  @ManyToOne(() => Lab, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'labId' })
  lab!: Lab;

  @Column({ type: 'enum', enum: LabWorkType, array: true, default: [] })
  workTypes!: LabWorkType[];

  /** فک: for a night guard, which is made per jaw and has no tooth numbers. */
  @Column({ type: 'enum', enum: LabJaw, nullable: true })
  jaw!: LabJaw | null;

  /** تعداد دندان‌ها */
  @Column({ type: 'smallint', nullable: true })
  toothCount!: number | null;

  /** شماره دندان‌ها, as written: «۶ بالا راست»، «فک بالا». */
  @Column({ type: 'varchar', length: 200, default: '' })
  teeth!: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  implantBrand!: string | null;

  /**
   * Impression copings and analogs sent with an implant crown. They belong to
   * the clinic and the lab owes them back, which is what `partsReturnedAt`
   * tracks — the book kept a column for exactly that.
   */
  @Column({ type: 'smallint', nullable: true })
  impressionCount!: number | null;

  @Column({ type: 'smallint', nullable: true })
  analogCount!: number | null;

  @Column({ type: 'date', nullable: true })
  partsReturnedAt!: Date | null;

  /** Fitted for the patient. The case is done; the parts may still be owed. */
  @Index()
  @Column({ type: 'date', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'text', default: '' })
  searchText!: string;

  @OneToMany(() => LabTrip, (t) => t.labCase)
  trips!: LabTrip[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Bumped by every edit and every move. The edit form, which also corrects
   * the latest trip, is refused if the case was moved since it was loaded —
   * otherwise a correction meant for one trip would land on the next.
   */
  @VersionColumn()
  version!: number;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
