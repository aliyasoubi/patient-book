import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import {
  InventoryCategory,
  InventoryMovementKind,
  InventoryUnit,
  normalizeForDisplay,
} from '../../../domain';
import { parseExpiry } from '../inventory-stock';

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};
const clean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeForDisplay(value) || null : value;

/** Far beyond any clinic's shelf; a typo of extra zeros is refused, not stocked. */
const MAX_QUANTITY = 100_000;

/** An expiry as printed on the pack — see `parseExpiry` for what reads. */
@ValidatorConstraint({ name: 'expiry', async: false })
export class IsExpiryConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    return typeof value === 'string' && parseExpiry(value) !== null;
  }
  defaultMessage(args: ValidationArguments): string {
    return `"${String(args.value)}" is not a readable expiry`;
  }
}

/** Something has to come in or go out; only a count may find the shelf empty. */
@ValidatorConstraint({ name: 'movementQuantity', async: false })
class MovementQuantityConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { kind } = args.object as { kind?: InventoryMovementKind };
    return (
      typeof value === 'number' &&
      (kind === InventoryMovementKind.Count ? value >= 0 : value >= 1)
    );
  }
  defaultMessage(): string {
    return 'Quantity must be at least 1, or 0 for a count';
  }
}

/** What narrows the list: the questions staff ask of their stock. */
export const INVENTORY_FILTERS = ['reorder', 'out', 'expiry'] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

/**
 * What narrows the list. It is never paged: a clinic's shelves are a few
 * hundred items, read best whole and grouped by category, as the lab board
 * shows every open case.
 */
export class QueryInventoryDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: InventoryCategory })
  @IsEnum(InventoryCategory)
  @IsOptional()
  category?: InventoryCategory;

  /**
   * `reorder`: at or under the reorder level. `out`: none left. `expiry`:
   * stock past or within 90 days of its expiry, soonest first.
   */
  @ApiPropertyOptional({ enum: INVENTORY_FILTERS })
  @IsIn(INVENTORY_FILTERS)
  @IsOptional()
  filter?: InventoryFilter;

  @ApiPropertyOptional({ description: 'Only archived items' })
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  archivedOnly?: boolean;
}

export class CreateInventoryItemDto {
  @ApiProperty({ enum: InventoryCategory })
  @IsEnum(InventoryCategory)
  category!: InventoryCategory;

  @ApiProperty({ example: 'Supe Line' })
  @Transform(({ value }) => normalizeForDisplay(String(value ?? '')))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Dentium' })
  @Transform(clean)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  brand?: string | null;

  @ApiPropertyOptional({ example: '4x10', description: 'Model, size or shade' })
  @Transform(clean)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  spec?: string | null;

  @ApiPropertyOptional({ enum: InventoryUnit, default: InventoryUnit.Piece })
  @IsEnum(InventoryUnit)
  @IsOptional()
  unit?: InventoryUnit;

  @ApiPropertyOptional({ description: 'Reorder at or under this many' })
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  @IsOptional()
  minQuantity?: number | null;

  @ApiPropertyOptional({
    example: '2028/07',
    description: 'As printed on the pack, Gregorian or Jalali',
  })
  @Transform(clean)
  @Validate(IsExpiryConstraint)
  @MaxLength(20)
  @IsOptional()
  expiry?: string | null;

  @ApiPropertyOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string | null;

  /** What is on the shelf now; recorded as the item's first count. */
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  @IsOptional()
  quantity?: number;
}

/** The item's own fields. Its quantity changes only through a movement. */
export class UpdateInventoryItemDto extends PartialType(
  OmitType(CreateInventoryItemDto, ['quantity'] as const),
) {
  /** The item's `version` as the form loaded it. Movements bump it too. */
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class InventoryMovementDto {
  @ApiProperty({ enum: InventoryMovementKind })
  @IsEnum(InventoryMovementKind)
  kind!: InventoryMovementKind;

  /** How many came in or went out — or, for a count, how many are on the shelf. */
  @ApiProperty({ minimum: 0, example: 1 })
  @IsInt()
  @Validate(MovementQuantityConstraint)
  @Max(MAX_QUANTITY)
  quantity!: number;

  /** On a delivery or a count: the expiry printed on these packs. */
  @ApiPropertyOptional({ example: '2028/07' })
  @Transform(clean)
  @Validate(IsExpiryConstraint)
  @MaxLength(20)
  @IsOptional()
  expiry?: string | null;

  @ApiPropertyOptional({ description: 'Supplier, patient file, reason' })
  @Transform(clean)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  note?: string | null;
}
