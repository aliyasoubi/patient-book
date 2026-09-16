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
} from 'class-validator';

import { PaginationDto } from '../../presentation/http/dto/pagination.dto';
import { CaseStatus } from '../../domain';
import { normalizeForDisplay } from '../../domain';
import { identifier, optionalIdentifier } from '../patients/dto/patient.dto';

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};
const clean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) || null : value;

export class QueryRegistryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search across register number and name',
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: CaseStatus })
  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  @ApiPropertyOptional({ description: 'Only entries not linked to a patient' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  unlinkedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Only archived entries' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  archivedOnly?: boolean;
}

export class UpsertRegistryCaseDto {
  @ApiPropertyOptional({
    description:
      'Number within this register (independent of the main file number)',
  })
  @Transform(identifier)
  @Matches(/^\d{1,24}$/)
  registryNo!: string;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(160)
  @IsOptional()
  recordedName?: string;

  @ApiPropertyOptional({ description: 'Linked patient in the main book' })
  @IsUUID()
  @IsOptional()
  patientId?: string | null;

  @ApiPropertyOptional()
  @Transform(optionalIdentifier)
  @Matches(/^09\d{9}$/)
  @IsOptional()
  mobile?: string | null;

  @ApiPropertyOptional()
  @Transform(optionalIdentifier)
  @Matches(/^\d{4,15}$/)
  @IsOptional()
  homePhone?: string | null;

  @ApiPropertyOptional({ enum: CaseStatus })
  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string | null;
}

export class UpdateRegistryCaseDto extends PartialType(UpsertRegistryCaseDto) {}
