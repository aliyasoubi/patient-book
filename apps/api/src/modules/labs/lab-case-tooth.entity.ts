import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { LabWorkType } from '../../domain';
import { LabCase } from './lab-case.entity';

/**
 * One tooth of a lab case and the work it gets — a crown on 14, a laminate on
 * 11 — the way a lab prescription marks each tooth on its chart. A tooth gets
 * one kind of work per case, which the primary key holds.
 *
 * Only ever written whole, by the case's own save: the case's `teethFdi` and
 * `workTypes` are read off these rows in the same transaction.
 */
@Entity('lab_case_teeth')
export class LabCaseTooth {
  @PrimaryColumn({ type: 'uuid' })
  labCaseId!: string;

  @ManyToOne(() => LabCase, (c) => c.toothWork, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labCaseId' })
  labCase!: LabCase;

  /** FDI number, `16` being the upper right first molar. */
  @PrimaryColumn({ type: 'smallint' })
  tooth!: number;

  /** Per-tooth work only; the database refuses a night guard or SX here. */
  @Column({
    type: 'enum',
    enum: LabWorkType,
    enumName: 'lab_cases_worktypes_enum',
  })
  workType!: LabWorkType;
}
