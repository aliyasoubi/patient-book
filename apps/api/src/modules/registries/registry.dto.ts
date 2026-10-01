import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationDto } from '../../presentation/http/dto/pagination.dto';
import { CaseStatus } from '../../domain';
import { normalizeForDisplay } from '../../domain';
import {
  identifier,
  optionalIdentifier,
  REGISTER_NUMBER,
} from '../patients/dto/patient.dto';

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
  @Matches(REGISTER_NUMBER)
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

export class UpdateRegistryCaseDto extends PartialType(UpsertRegistryCaseDto) {
  /**
   * The case's `version` as the client loaded it; the update is refused with
   * `ERR_REGISTRY_CASE_MODIFIED` if it has been saved since. Required, as for
   * patients: every edit here comes from a whole form, and a caller that
   * could leave it out could overwrite an edit it never saw.
   */
  @ApiProperty({ description: 'Version the client loaded; refused if stale' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
