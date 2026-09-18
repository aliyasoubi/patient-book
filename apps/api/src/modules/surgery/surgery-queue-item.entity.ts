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
import {
  AbutmentType,
  DatePrecisionEnum,
  SurgeryKind,
  SurgeryStatus,
} from '../../domain';
import { ImplantCase } from '../implants/implant-case.entity';

/**
 * لیست انتظار جراحی — the second-stage surgery queue.
 *
 * Rows reference an implant *register* number, not a patient file number.
 * Because such registers reuse numbers as old books are retired, a row can name
 * a different person than the number's current holder. The recorded name is
 * stored verbatim and mismatches are flagged rather than resolved by fiat.
 */
@Entity('surgery_queue')
export class SurgeryQueueItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  implantCaseId!: string | null;

  @ManyToOne(() => ImplantCase, (c) => c.surgeries, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'implantCaseId' })
  implantCase!: ImplantCase | null;

  @Column({ type: 'enum', enum: SurgeryKind, default: SurgeryKind.Implant })
  kind!: SurgeryKind;

  /** The register number as written on the waiting list. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  implantRegistryNo!: string | null;

  @Column({ type: 'varchar', length: 160, default: '' })
  recordedName!: string;

  /**
   * True when the queue row's name disagrees with the implant register entry
   * it points at — a number that has been reused. Surfaced in the UI so staff
   * confirm the right patient before operating.
   */
  @Column({ type: 'boolean', default: false })
  hasNameMismatch!: boolean;

  @Index()
  @Column({ type: 'date', nullable: true })
  surgeryDate!: Date | null;

  @Column({ type: 'enum', enum: DatePrecisionEnum, nullable: true })
  surgeryDatePrecision!: DatePrecisionEnum | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  surgeryDateRaw!: string | null;

  /**
   * شماره دندان — in practice the practice writes brand, tooth number and
   * quadrant in one phrase ("دنتیوم، ۶ و ۷ راست پایین"). Kept as written; the
   * brand is additionally split out below where it is recognisable.
   */
  @Column({ type: 'varchar', length: 200, default: '' })
  toothPosition!: string;

  /** Implant system, parsed from the leading token of `toothPosition`. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  implantBrand!: string | null;

  @Column({ type: 'enum', enum: AbutmentType, default: AbutmentType.Unknown })
  abutmentType!: AbutmentType;

  @Column({ type: 'varchar', length: 60, nullable: true })
  abutmentRaw!: string | null;

  /**
   * تاریخ پروتز as the imported sheets recorded it — a bare Jalali month name
   * such as "آذر ماه". Legacy only: new rows carry the structured follow-up
   * below, and this is shown as a hint when that is missing.
   */
  @Column({ type: 'varchar', length: 60, nullable: true })
  prosthesisDue!: string | null;

  /**
   * The follow-up a surgery implies: a check after an extraction to plan the
   * implant, or the prosthesis after an implant. Chosen as months after the
   * surgery — bone heals on that timescale, so "three months" is what the
   * dentist actually decides — and resolved to a date so the list can be
   * asked "who is due this month".
   */
  @Column({ type: 'smallint', nullable: true })
  followUpMonths!: number | null;

  /** `surgeryDate` plus `followUpMonths` Jalali months; recomputed when either changes. */
  @Index()
  @Column({ type: 'date', nullable: true })
  followUpDate!: Date | null;

  /** Set when the patient came in for it; a due follow-up stays due until then. */
  @Column({ type: 'date', nullable: true })
  followUpDoneAt!: Date | null;

  /**
   * Rows are written after the surgery, so a new one is `completed`; the
   * value is kept for the odd row that is genuinely still ahead, and for
   * the imported history.
   */
  @Column({
    type: 'enum',
    enum: SurgeryStatus,
    default: SurgeryStatus.Completed,
  })
  status!: SurgeryStatus;

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
