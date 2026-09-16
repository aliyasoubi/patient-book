import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
} from 'class-validator';
import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { EducationLevel, Gender } from '../../../domain';
import {
  isValidNationalId,
  normalizeForDisplay,
  toLatinDigits,
} from '../../../domain';
import { JalaliDate } from '../../../domain';

/** Names and free text keep their spelling; only keyboard artefacts are fixed. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) : value;

const emptyToNull = ({ value }: { value: unknown }): unknown => {
  if (value === '' || value === undefined) return null;
  return typeof value === 'string' ? normalizeForDisplay(value) || null : value;
};

/**
 * Identifiers — file number, national id, phone numbers — are stored as ASCII
 * digits whichever keyboard typed them. A Persian keyboard emits `۰۹۱۲…` for
 * what the receptionist reads as `0912…`; folding here, before validation,
 * means the `@Matches` rules below see one script and the database never
 * holds the same number in three. The client folds too, but this side is the
 * one that decides what gets stored.
 */
export const identifier = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? toLatinDigits(normalizeForDisplay(value)) : value;

export const optionalIdentifier = ({ value }: { value: unknown }): unknown => {
  if (value === '' || value === undefined) return null;
  return typeof value === 'string'
    ? toLatinDigits(normalizeForDisplay(value)) || null
    : value;
};

@ValidatorConstraint({ name: 'jalaliDate', async: false })
export class IsJalaliDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    return typeof value === 'string' && JalaliDate.isValid(value);
  }
  defaultMessage(args: ValidationArguments): string {
    return `"${args.value}" is not a valid Jalali date`;
  }
}

@ValidatorConstraint({ name: 'nationalId', async: false })
export class IsNationalIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    // Digits only: the check-digit rule alone would pass `007-898-0501` and
    // let the dashes through to the database.
    return (
      typeof value === 'string' &&
      /^\d{10}$/.test(value) &&
      isValidNationalId(value)
    );
  }
  defaultMessage(): string {
    return 'National id fails its check digit';
  }
}

/** One procedure recorded against the patient. */
export class TreatmentInputDto {
  @ApiProperty({ example: 'implant' })
  @IsString()
  @MaxLength(48)
  code!: string;

  @ApiPropertyOptional({ example: '1404/06/12' })
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  performedAt?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string | null;
}

export class CreatePatientDto {
  @ApiProperty({ example: '12134', description: 'Practice file number' })
  @Transform(identifier)
  @IsString()
  @Matches(/^\d{1,24}$/)
  fileNo!: string;

  @ApiProperty({ example: 'مریم' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'کریمی' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName!: string;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  fatherName?: string | null;

  @ApiPropertyOptional({ example: '0078980501' })
  @Transform(optionalIdentifier)
  @Validate(IsNationalIdConstraint)
  @IsOptional()
  nationalId?: string | null;

  @ApiPropertyOptional({ enum: Gender, default: Gender.Unknown })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: '09121234567' })
  @Transform(optionalIdentifier)
  @Matches(/^09\d{9}$/)
  @IsOptional()
  mobile?: string | null;

  @ApiPropertyOptional({ example: '22334455' })
  @Transform(optionalIdentifier)
  @Matches(/^\d{4,15}$/)
  @IsOptional()
  homePhone?: string | null;

  @ApiPropertyOptional({ example: '1368/05/12', description: 'Jalali date' })
  @Transform(emptyToNull)
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  birthDate?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  occupation?: string | null;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsEnum(EducationLevel)
  @IsOptional()
  education?: EducationLevel;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  referralSourceId?: string | null;

  @ApiPropertyOptional({
    description: 'Referral source name; created if it does not already exist',
  })
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  referralSourceName?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  medicalHistory?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  homeAddress?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  workAddress?: string | null;

  @ApiPropertyOptional({ example: '1404/01/15' })
  @Transform(emptyToNull)
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  firstVisitAt?: string | null;

  @ApiPropertyOptional({ example: '1405/06/01' })
  @Transform(emptyToNull)
  @Validate(IsJalaliDateConstraint)
  @IsOptional()
  lastVisitAt?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  notes?: string | null;

  @ApiPropertyOptional({ type: [TreatmentInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TreatmentInputDto)
  @IsOptional()
  treatments?: TreatmentInputDto[];
}

/** Every field optional; `fileNo` may be changed but must stay unique. */
export class UpdatePatientDto extends PartialType(CreatePatientDto) {
  /**
   * The `version` the client loaded. The update is refused with
   * `ERR_PATIENT_MODIFIED` if the record has been saved since. Required, not
   * optional: a caller that could leave it out could also silently overwrite
   * an edit it never saw. Reconcile apply reads the version it checked against
   * and sends that.
   */
  @ApiProperty({ description: 'Version the client loaded; refused if stale' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
