import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PatientTreatment } from './patient-treatment.entity';

/**
 * The catalogue of procedures the practice records against a patient. Seeded
 * with the thirteen columns of the original spreadsheet; the practice can add
 * more without a schema change, which the spreadsheet could never do.
 */
@Entity('treatment_types')
export class TreatmentType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 48 })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  nameFa!: string;

  @Column({ type: 'varchar', length: 80 })
  nameEn!: string;

  /** Material Symbols ligature name shown on the treatment chip. */
  @Column({ type: 'varchar', length: 48, default: 'dentistry' })
  icon!: string;

  /** Chip colour, as an M3 palette key the frontend maps to a real colour. */
  @Column({ type: 'varchar', length: 24, default: 'primary' })
  color!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => PatientTreatment, (pt) => pt.treatmentType)
  patientTreatments!: PatientTreatment[];
}
