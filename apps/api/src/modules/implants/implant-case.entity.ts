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
} from 'typeorm';
import { CaseStatus } from '../../domain';
import { Patient } from '../patients/patient.entity';
import { SurgeryQueueItem } from '../surgery/surgery-queue-item.entity';

/**
 * The implant register (بیماران ایمپلنت).
 *
 * Critically, this register runs its **own** numbering sequence (1000–9999)
 * which overlaps numerically with the main patient file numbers (9901–12133)
 * while referring to entirely different people — of the 99 numbers present in
 * both sheets, only 2 are the same human. Joining the two books on their number
 * would have mislinked 97 patients. `registryNo` is therefore kept as its own
 * column and the link to `patient` is established by name, nullable so an
 * unmatched entry stays visible instead of being dropped or guessed at.
 */
@Entity('implant_cases')
export class ImplantCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** شماره پرونده ایمپلنت — belongs to this register, not to `patients`. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  registryNo!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  patientId!: string | null;

  @ManyToOne(() => Patient, (p) => p.implantCases, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'patientId' })
  patient!: Patient | null;

  /** The name exactly as the implant book records it, kept even once linked. */
  @Column({ type: 'varchar', length: 160, default: '' })
  recordedName!: string;

  /**
   * How `patientId` was established, so staff can tell a confirmed link from
   * one an import inferred from a name.
   */
  @Column({ type: 'varchar', length: 16, default: 'unmatched' })
  matchMethod!: 'exact' | 'fuzzy' | 'manual' | 'unmatched';

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  homePhone!: string | null;

  @Column({ type: 'enum', enum: CaseStatus, default: CaseStatus.Active })
  status!: CaseStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'text', default: '' })
  searchText!: string;

  @OneToMany(() => SurgeryQueueItem, (s) => s.implantCase)
  surgeries!: SurgeryQueueItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
