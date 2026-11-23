import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { normalizeForDisplay } from '../../../domain';

/** Ten digits, as the form takes them: past any price the clinic will charge. */
export const MAX_TARIFF_PRICE = 9_999_999_999;

/** Folded for display; anything not text is left for `IsString` to refuse. */
const text = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) : value;
const clean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) || null : value;

export class CreateTariffDto {
  @ApiProperty({ example: 'عمومی' })
  @Transform(text)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category!: string;

  @ApiProperty({ example: 'جرم‌گیری' })
  @Transform(text)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  /** In rials; the least it costs when there is a `maxPrice`. */
  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsInt()
  @Min(0)
  @Max(MAX_TARIFF_PRICE)
  @IsOptional()
  price?: number | null;

  /** In rials: the top of a range. Needs a `price` under it. */
  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsInt()
  @Min(0)
  @Max(MAX_TARIFF_PRICE)
  @IsOptional()
  maxPrice?: number | null;

  @ApiPropertyOptional({ example: 'هر فک' })
  @Transform(clean)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  note?: string | null;
}

export class UpdateTariffDto extends PartialType(CreateTariffDto) {
  /** The line's `version` as the form loaded it. */
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
