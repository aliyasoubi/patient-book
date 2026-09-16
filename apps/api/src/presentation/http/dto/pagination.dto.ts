import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ default: 25, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit: number = 25;

  @ApiPropertyOptional({ description: 'Column to sort by' })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @Transform(({ value }) => String(value ?? 'ASC').toUpperCase())
  @IsIn(['ASC', 'DESC'])
  @IsOptional()
  sortDir: 'ASC' | 'DESC' = 'ASC';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export class PageResult<T> {
  items!: T[];
  total!: number;
  page!: number;
  limit!: number;
  pageCount!: number;

  static of<T>(items: T[], total: number, dto: PaginationDto): PageResult<T> {
    return {
      items,
      total,
      page: dto.page,
      limit: dto.limit,
      pageCount: Math.max(1, Math.ceil(total / dto.limit)),
    };
  }
}
