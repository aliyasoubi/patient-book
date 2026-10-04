import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { TreatmentType } from './treatment-type.entity';

/**
 * A procedure a patient has had. The spreadsheet could only say yes/no; this
 * carries a date and a note as well, so the practice can start recording *when*
 * without another migration.
 */
@Entity('patient_treatments')
@Unique('uq_patient_treatment', ['patientId', 'treatmentTypeId'])
export class PatientTreatment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  patientId!: string;

  // Pairs with `patientId`. With this relation loaded, save() takes the id from it
  // and ignores a changed `patientId` — set both, or drop the relation (CLAUDE.md).
  @ManyToOne(() => Patient, (p) => p.treatments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient!: Patient;

  @Index()
  @Column({ type: 'uuid' })
  treatmentTypeId!: string;

  // Pairs with `treatmentTypeId`. With this relation loaded, save() takes the id from it
  // and ignores a changed `treatmentTypeId` — set both, or drop the relation (CLAUDE.md).
  @ManyToOne(() => TreatmentType, (t) => t.patientTreatments, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'treatmentTypeId' })
  treatmentType!: TreatmentType;

  /** Null for imported rows: the spreadsheet only ever recorded a tick. */
  @Column({ type: 'date', nullable: true })
  performedAt!: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  performedAtRaw!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
