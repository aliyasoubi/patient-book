import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReferralKind } from '../../domain';
import { Patient } from '../patients/patient.entity';

/**
 * نحوه آشنایی — how a patient found the practice. The source sheet holds 93
 * distinct spellings of maybe a dozen real answers, so the normalised name is
 * the unique key and the display name is whatever the practice prefers to read.
 */
@Entity('referral_sources')
export class ReferralSource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Persian-folded, lowercased — dedupes ماهی‌صفت / ماهي صفت / ماهی صفت. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  normalizedName!: string;

  @Column({ type: 'enum', enum: ReferralKind, default: ReferralKind.Other })
  kind!: ReferralKind;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => Patient, (p) => p.referralSource)
  patients!: Patient[];
}
