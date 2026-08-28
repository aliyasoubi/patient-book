import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Validate,
} from 'class-validator';

import { PaginationDto } from '../../../presentation/http/dto/pagination.dto';
import { AbutmentType, SurgeryStatus } from '../../../domain';
import { normalizeForDisplay } from '../../../domain';
import { IsJalaliDateConstraint } from '../../patients/dto/patient.dto';

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
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  implantCaseId?: string | null;

  @ApiPropertyOptional({ description: 'Implant register number' })
  @Transform(clean)
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

  @ApiPropertyOptional({ enum: AbutmentType })
  @IsEnum(AbutmentType)
  @IsOptional()
  abutmentType?: AbutmentType;

  @ApiPropertyOptional({ example: 'آذر ماه' })
  @Transform(clean)
  @IsString()
  @MaxLength(60)
  @IsOptional()
  prosthesisDue?: string | null;

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
