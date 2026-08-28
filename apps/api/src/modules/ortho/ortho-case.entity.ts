import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CaseStatus } from '../../domain';
import { Patient } from '../patients/patient.entity';

/**
 * The orthodontic register (بیماران ارتو). Like the implant book it numbers
 * itself independently — its 3000-series numbers collide with main file numbers
 * for different people — so it keeps its own `registryNo` and links to a
 * patient by name where one can be found.
 */
@Entity('ortho_cases')
export class OrthoCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  registryNo!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  patientId!: string | null;

  @ManyToOne(() => Patient, (p) => p.orthoCases, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'patientId' })
  patient!: Patient | null;

  @Column({ type: 'varchar', length: 160, default: '' })
  recordedName!: string;

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
