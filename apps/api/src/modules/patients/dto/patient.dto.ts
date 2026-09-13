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
import { isValidNationalId, normalizeForDisplay } from '../../../domain';
import { JalaliDate } from '../../../domain';

/** Names and free text keep their spelling; only keyboard artefacts are fixed. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) : value;

const emptyToNull = ({ value }: { value: unknown }): unknown => {
  if (value === '' || value === undefined) return null;
  return typeof value === 'string' ? normalizeForDisplay(value) || null : value;
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
    return isValidNationalId(String(value));
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
  @Transform(trim)
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
  @Transform(emptyToNull)
  @Validate(IsNationalIdConstraint)
  @IsOptional()
  nationalId?: string | null;

  @ApiPropertyOptional({ enum: Gender, default: Gender.Unknown })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: '09121234567' })
  @Transform(emptyToNull)
  @Matches(/^09\d{9}$/)
  @IsOptional()
  mobile?: string | null;

  @ApiPropertyOptional({ example: '22334455' })
  @Transform(emptyToNull)
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

  @ApiPropertyOptional({ description: 'Referral source name; created if it does not already exist' })
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
   * The `version` the client loaded. When present, the update is refused with
   * `ERR_PATIENT_MODIFIED` if the record has been saved since. Optional so
   * callers that already carry their own staleness check (reconcile apply)
   * are unaffected.
   */
  @ApiPropertyOptional({ description: 'Version the client loaded; refused if stale' })
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedVersion?: number;
}
