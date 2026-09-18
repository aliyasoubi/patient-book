import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
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
import { AbutmentType, SurgeryKind, SurgeryStatus } from '../../../domain';
import { FOLLOW_UP_FILTERS, FollowUpFilter } from '../follow-up';
import { normalizeForDisplay, IMPLANT_BRAND_NAMES } from '../../../domain';
import {
  IsJalaliDateConstraint,
  optionalIdentifier,
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

  /** Open follow-ups within the named window (see `followUpWindow`), soonest first. */
  @ApiPropertyOptional({ enum: FOLLOW_UP_FILTERS })
  @IsIn(FOLLOW_UP_FILTERS)
  @IsOptional()
  followUp?: FollowUpFilter;

  @ApiPropertyOptional({ description: 'Only archived entries' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  archivedOnly?: boolean;

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

  @ApiPropertyOptional({ description: 'Implant register number' })
  @Transform(optionalIdentifier)
  @Matches(/^\d{1,24}$/)
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

  /** When the follow-up happened, as a Jalali date; `null` reopens it. */
  @ApiPropertyOptional({ example: '1405/09/27' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  followUpDoneAt?: string | null;

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

export class UpdateSurgeryDto extends PartialType(UpsertSurgeryDto) {}
