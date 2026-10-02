import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';

import { PaginationDto } from '../../../presentation/http/dto/pagination.dto';
import {
  IMPLANT_BRAND_NAMES,
  LabJaw,
  LabTripKind,
  LabWorkType,
  normalizeForDisplay,
} from '../../../domain';
import { IsJalaliDateConstraint } from '../../patients/dto/patient.dto';

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};
const clean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) || null : value;

/** A lab's turnaround as the form offers it: days, up to three months. */
const MAX_WAIT_DAYS = 90;

// -- Labs ------------------------------------------------------------------

export class CreateLabDto {
  @ApiProperty({ example: 'فرهنگ' })
  @Transform(({ value }) => normalizeForDisplay(String(value ?? '')))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}

export class UpdateLabDto extends PartialType(CreateLabDto) {
  @ApiPropertyOptional({ description: 'Offer the lab for new cases' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// -- Lab cases ---------------------------------------------------------------

/** What narrows the board; it is never paged — active work is always all shown. */
export class LabBoardQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  labId?: string;
}

/** Every case, newest first: one patient's lab work, or the archive. */
export class QueryLabCasesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Only archived cases' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  archivedOnly?: boolean;
}

export class CreateLabCaseDto {
  @ApiPropertyOptional({ description: 'Patient file the case belongs to' })
  @IsUUID()
  @IsOptional()
  patientId?: string | null;

  @ApiProperty()
  @Transform(clean)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  recordedName!: string;

  @ApiProperty()
  @IsUUID()
  labId!: string;

  @ApiProperty({ enum: LabWorkType, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsEnum(LabWorkType, { each: true })
  workTypes!: LabWorkType[];

  /** For a night guard, instead of the tooth count and numbers. */
  @ApiPropertyOptional({ enum: LabJaw })
  @IsEnum(LabJaw)
  @IsOptional()
  jaw?: LabJaw | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 32 })
  @IsInt()
  @Min(1)
  @Max(32)
  @IsOptional()
  toothCount?: number | null;

  @ApiPropertyOptional({ example: '۶ بالا راست' })
  @Transform(clean)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  teeth?: string | null;

  @ApiPropertyOptional({ enum: IMPLANT_BRAND_NAMES })
  @IsIn(IMPLANT_BRAND_NAMES)
  @IsOptional()
  implantBrand?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 32 })
  @IsInt()
  @Min(0)
  @Max(32)
  @IsOptional()
  impressionCount?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 32 })
  @IsInt()
  @Min(0)
  @Max(32)
  @IsOptional()
  analogCount?: number | null;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string | null;

  // The first trip, which a case is opened with: it exists because something
  // was sent. On an edit these correct the latest trip instead.

  @ApiProperty({ enum: LabTripKind })
  @IsEnum(LabTripKind)
  tripKind!: LabTripKind;

  @ApiProperty({ example: '1405/07/07' })
  @Validate(IsJalaliDateConstraint)
  @IsString()
  sentAt!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_WAIT_DAYS, example: 7 })
  @IsInt()
  @Min(1)
  @Max(MAX_WAIT_DAYS)
  waitDays!: number;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  tripNote?: string | null;
}

export class UpdateLabCaseDto extends PartialType(CreateLabCaseDto) {
  /**
   * The case's `version` as the form loaded it. Moves bump it too, so a
   * correction to "the latest trip" cannot land on a trip sent since.
   */
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

/** Back from the lab, or fitted for the patient: on the day given, today if none. */
export class LabCaseDateDto {
  @ApiPropertyOptional({ example: '1405/07/09' })
  @Validate(IsJalaliDateConstraint)
  @IsString()
  @IsOptional()
  date?: string;
}

/** Back to the lab, for the reason given. */
export class SendLabCaseDto {
  @ApiProperty({ enum: LabTripKind })
  @IsEnum(LabTripKind)
  kind!: LabTripKind;

  @ApiPropertyOptional({
    example: '1405/07/09',
    description: 'Today if omitted',
  })
  @Validate(IsJalaliDateConstraint)
  @IsString()
  @IsOptional()
  sentAt?: string;

  @ApiProperty({ minimum: 1, maximum: MAX_WAIT_DAYS, example: 7 })
  @IsInt()
  @Min(1)
  @Max(MAX_WAIT_DAYS)
  waitDays!: number;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  note?: string | null;
}

/**
 * Take back the last move. Unlike the moves themselves it names the version
 * it was offered on: two undos from the same card must not undo twice.
 */
export class UndoLabCaseDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class PartsReturnedDto {
  @ApiProperty({ description: 'false reopens: the parts are still at the lab' })
  @IsBoolean()
  returned!: boolean;
}
