import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  CONSUMPTION_MONTHS,
  type ConsumptionMonths,
} from '../material-consumption';

export class ConsumptionQueryDto {
  @ApiPropertyOptional({ enum: CONSUMPTION_MONTHS, default: 6 })
  @Type(() => Number)
  @IsIn(CONSUMPTION_MONTHS)
  @IsOptional()
  months: ConsumptionMonths = 6;

  /** Narrows the items as the stock list's search does. */
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;
}
