import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import type { DuplicateQuery } from '../possible-duplicates';

/**
 * What the registration form has typed so far. Every field is optional and
 * none is format-checked: a half-typed number is not an error here, it simply
 * matches nothing until it is whole. Folding (digits, spelling) happens in
 * `duplicateCriteria`, the one place that decides what a match is.
 */
export class PossibleDuplicatesQueryDto implements DuplicateQuery {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  fatherName?: string;

  @ApiPropertyOptional({ example: '0078980501' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  nationalId?: string;

  @ApiPropertyOptional({ example: '09121234567' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  mobile?: string;
}
