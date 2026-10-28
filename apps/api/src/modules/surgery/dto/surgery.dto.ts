import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';

import { PaginationDto } from '../../../presentation/http/dto/pagination.dto';
import {
  AbutmentType,
  ContactOutcome,
  FollowUpStatus,
  LAB_TOOTH_NUMBERS,
  SurgeryKind,
  SurgeryStatus,
} from '../../../domain';
import { FOLLOW_UP_FILTERS, FollowUpFilter } from '../follow-up';
import { normalizeForDisplay, IMPLANT_BRAND_NAMES } from '../../../domain';
import {
  IsJalaliDateConstraint,
  optionalIdentifier,
  REGISTER_NUMBER,
} from '../../patients/dto/patient.dto';

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};
const clean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) || null : value;

export class QuerySurgeryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: SurgeryStatus })
  @IsEnum(SurgeryStatus)
  @IsOptional()
  status?: SurgeryStatus;

  @ApiPropertyOptional({
    description: 'Only rows whose name disagrees with the implant register',
  })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  mismatchedOnly?: boolean;

  /**
   * Open follow-ups within the named window (see `followUpWindow`), soonest
   * first; or, for `booked` and `declined`, the ones settled that way.
   */
  @ApiPropertyOptional({ enum: FOLLOW_UP_FILTERS })
  @IsIn(FOLLOW_UP_FILTERS)
  @IsOptional()
  followUp?: FollowUpFilter;

  @ApiPropertyOptional({ description: 'Only archived entries' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  archivedOnly?: boolean;

  /** One patient's follow-ups, for their file. */
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Only rows not yet linked to a patient file',
  })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  unlinkedOnly?: boolean;

  @ApiPropertyOptional({ example: '1404/01/01' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '1405/12/29' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  to?: string;
}

export class UpsertSurgeryDto {
  @ApiPropertyOptional({ enum: SurgeryKind, default: SurgeryKind.Implant })
  @IsEnum(SurgeryKind)
  @IsOptional()
  kind?: SurgeryKind;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  implantCaseId?: string | null;

  /** The patient file the follow-up is for; `null` unlinks it. */
  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  patientId?: string | null;

  @ApiPropertyOptional({ description: 'Implant register number' })
  @Transform(optionalIdentifier)
  @Matches(REGISTER_NUMBER)
  @IsOptional()
  implantRegistryNo?: string | null;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(160)
  @IsOptional()
  recordedName?: string;

  @ApiPropertyOptional({ example: '1404/06/11' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  surgeryDate?: string | null;

  /** The teeth, as FDI numbers: `16` is the upper right first molar. */
  @ApiPropertyOptional({ type: [Number], example: [36, 37] })
  @IsArray()
  @ArrayMaxSize(LAB_TOOTH_NUMBERS.length)
  @ArrayUnique()
  @IsIn(LAB_TOOTH_NUMBERS, { each: true })
  @IsOptional()
  teethFdi?: number[];

  /** Legacy free text; the web form no longer writes it, imports and old clients may. */
  @ApiPropertyOptional({ example: 'دنتیوم، ۶ و ۷ راست پایین' })
  @Transform(clean)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  toothPosition?: string;

  @ApiPropertyOptional({ enum: IMPLANT_BRAND_NAMES })
  @IsIn(IMPLANT_BRAND_NAMES)
  @IsOptional()
  implantBrand?: string | null;

  @ApiPropertyOptional({ enum: AbutmentType })
  @IsEnum(AbutmentType)
  @IsOptional()
  abutmentType?: AbutmentType;

  /** Months after the surgery date; the API resolves the date. `null` clears it. */
  @ApiPropertyOptional({ minimum: 1, maximum: 12, example: 3 })
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  followUpMonths?: number | null;

  /** Where the follow-up stands with the patient; `open` reopens it. */
  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsEnum(FollowUpStatus)
  @IsOptional()
  followUpStatus?: FollowUpStatus;

  /**
   * The day the patient was booked for, as a Jalali date. Kept only while the
   * follow-up is `booked`; any other status clears it.
   */
  @ApiPropertyOptional({ example: '1405/09/27' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  followUpAppointmentAt?: string | null;

  @ApiPropertyOptional({ enum: SurgeryStatus })
  @IsEnum(SurgeryStatus)
  @IsOptional()
  status?: SurgeryStatus;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string | null;
}

/**
 * Everything but `kind`: what was done is settled when the row is added. A row
 * recorded under the wrong kind is deleted and added again — converting one
 * in place would leave the other kind's fields behind. With unknown fields
 * forbidden, a client that still sends it is told so rather than ignored.
 */
export class UpdateSurgeryDto extends PartialType(
  OmitType(UpsertSurgeryDto, ['kind'] as const),
) {
  /**
   * The row's `version` as the client loaded it; the update is refused with
   * `ERR_SURGERY_ITEM_MODIFIED` if it has been saved since. Required for any
   * edit but one: the card's follow-up status, which sends `followUpStatus`
   * and its appointment day alone — one deliberate fact about the patient,
   * which overwrites nothing else and must not fail because someone
   * corrected the tooth meanwhile. Sent with one anyway — an Undo of that
   * status — the version is checked like any edit's.
   */
  @ApiPropertyOptional({
    description:
      'Version the client loaded; refused if stale. Required unless only followUpStatus / followUpAppointmentAt are sent, and checked whenever sent',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedVersion?: number;
}

/**
 * A call about a follow-up and what it came to. "Booked" and "declined"
 * settle the follow-up as the card's status would; the other two leave it
 * open, with the day to call again.
 */
export class RecordContactDto {
  @ApiProperty({ enum: ContactOutcome })
  @IsEnum(ContactOutcome)
  outcome!: ContactOutcome;

  @ApiPropertyOptional({ maxLength: 300 })
  @Transform(clean)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  note?: string | null;

  /** No answer, call later: the day to call again. */
  @ApiPropertyOptional({ example: '1405/08/10' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  nextContactAt?: string | null;

  /** Booked: the day of the appointment, when it is known. */
  @ApiPropertyOptional({ example: '1405/08/12' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  appointmentAt?: string | null;
}
