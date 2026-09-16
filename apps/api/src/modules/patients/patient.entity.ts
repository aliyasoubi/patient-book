import {
  BeforeInsert,
  BeforeUpdate,
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
import {
  DataIssue,
  DatePrecisionEnum,
  EducationLevel,
  Gender,
  searchKey,
} from '../../domain';
import { ReferralSource } from '../treatments/referral-source.entity';
import { PatientTreatment } from '../treatments/patient-treatment.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import { OrthoCase } from '../ortho/ortho-case.entity';

/**
 * A single row of the practice's patient book (پرونده بیماران).
 *
 * Dates arrive as free-form Jalali text and are stored three ways: the parsed
 * Gregorian `date` for sorting and filtering, a precision flag because many
 * source values are only accurate to the year, and the untouched original so
 * nothing the practice wrote down is ever lost.
 */
@Entity('patients')
@Index('idx_patients_search', { synchronize: false }) // GIN trigram, see migration
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** شماره پرونده — the practice's own file number. Stable, human-quoted. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  fileNo!: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  firstName!: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  lastName!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  fatherName!: string | null;

  /** کد ملی — ten digits with the standard check digit. */
  @Index()
  @Column({ type: 'varchar', length: 10, nullable: true })
  nationalId!: string | null;

  @Column({ type: 'enum', enum: Gender, default: Gender.Unknown })
  gender!: Gender;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  homePhone!: string | null;

  // ── Birth date ───────────────────────────────────────────
  @Column({ type: 'date', nullable: true })
  birthDate!: Date | null;

  @Column({ type: 'enum', enum: DatePrecisionEnum, nullable: true })
  birthDatePrecision!: DatePrecisionEnum | null;

  /** Exactly what the sheet said, kept for provenance. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  birthDateRaw!: string | null;

  // ── Background ───────────────────────────────────────────
  @Column({ type: 'varchar', length: 120, nullable: true })
  occupation!: string | null;

  @Column({
    type: 'enum',
    enum: EducationLevel,
    default: EducationLevel.Unknown,
  })
  education!: EducationLevel;

  @Column({ type: 'varchar', length: 80, nullable: true })
  educationRaw!: string | null;

  @ManyToOne(() => ReferralSource, (r) => r.patients, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'referralSourceId' })
  referralSource!: ReferralSource | null;

  @Column({ type: 'uuid', nullable: true })
  referralSourceId!: string | null;

  /** سابقه بیماری قبلی — free text; surfaced as a warning banner in the UI. */
  @Column({ type: 'text', nullable: true })
  medicalHistory!: string | null;

  @Column({ type: 'text', nullable: true })
  homeAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  workAddress!: string | null;

  // ── Visits ───────────────────────────────────────────────
  @Column({ type: 'date', nullable: true })
  firstVisitAt!: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  firstVisitRaw!: string | null;

  @Index()
  @Column({ type: 'date', nullable: true })
  lastVisitAt!: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  lastVisitRaw!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // ── Relations ────────────────────────────────────────────
  @OneToMany(() => PatientTreatment, (pt) => pt.patient, {
    cascade: ['insert'],
  })
  treatments!: PatientTreatment[];

  @OneToMany(() => ImplantCase, (c) => c.patient)
  implantCases!: ImplantCase[];

  @OneToMany(() => OrthoCase, (c) => c.patient)
  orthoCases!: OrthoCase[];

  // ── Search & provenance ──────────────────────────────────
  /**
   * Denormalised, Persian-folded haystack covering name, file number, phone
   * numbers, national id and addresses. Backed by a GIN trigram index so a
   * receptionist can type any fragment of any of them into one box.
   */
  @Column({ type: 'text', default: '' })
  searchText!: string;

  /**
   * Import-time complaints about this row — an unparseable date, a national id
   * that fails its check digit. Stored as codes rather than sentences so the
   * UI renders them in the reader's language and the API stays locale-free.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  dataIssues!: DataIssue[];

  @Column({ type: 'boolean', default: false })
  isImported!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Bumped on every save. The edit form sends back the version it loaded, and
   * `PatientsService.update` refuses to overwrite a record that has moved on
   * since — two receptionists editing the same file no longer silently lose
   * one set of changes.
   */
  @VersionColumn()
  version!: number;

  /** Patient records are archived, never destroyed. */
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdById!: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById!: string | null;

  @BeforeInsert()
  @BeforeUpdate()
  buildSearchText(): void {
    this.searchText = searchKey(
      [
        this.fileNo,
        this.firstName,
        this.lastName,
        `${this.firstName ?? ''} ${this.lastName ?? ''}`,
        this.fatherName,
        this.nationalId,
        this.mobile,
        this.homePhone,
        this.occupation,
        this.homeAddress,
        this.workAddress,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  get fullName(): string {
    return `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim();
  }
}
