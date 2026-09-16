import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationDto } from '../../../presentation/http/dto/pagination.dto';
import { EducationLevel, Gender } from '../../../domain';

/** Split `?treatments=implant,veneer` and `?treatments=a&treatments=b` alike. */
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};

export class QueryPatientsDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Free-text search across name, file number, phones, national id, address and occupation',
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsEnum(EducationLevel)
  @IsOptional()
  education?: EducationLevel;

  @ApiPropertyOptional({
    description: 'Treatment codes; matches patients who have had all of them',
    example: 'implant,veneer',
  })
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  treatments?: string[];

  @ApiPropertyOptional({ description: 'Referral source id' })
  @IsUUID()
  @IsOptional()
  referralSourceId?: string;

  @ApiPropertyOptional({ description: 'Only records flagged for review' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  hasIssues?: boolean;

  @ApiPropertyOptional({
    description: 'Patients with no visit in this many months',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  @IsOptional()
  inactiveMonths?: number;

  @ApiPropertyOptional({
    description: 'Last visit on or after this Jalali date',
    example: '1403/01/01',
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  lastVisitFrom?: string;

  @ApiPropertyOptional({
    description: 'Last visit on or before this Jalali date',
    example: '1404/12/29',
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  lastVisitTo?: string;

  @ApiPropertyOptional({
    description: 'Only patients with a recorded medical history',
  })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  hasMedicalHistory?: boolean;

  @ApiPropertyOptional({ description: 'Include archived records' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  includeArchived?: boolean;
}
