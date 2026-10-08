import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { InventoryCategory, InventoryUnit } from '../../domain';
import { InventoryMovement } from './inventory-movement.entity';

/**
 * One thing on the clinic's shelves — a size of implant, a shade of
 * composite, a box of gloves — and how many of it there are.
 *
 * `quantity` is never written directly: it moves only through
 * {@link InventoryMovement}s, each in the same transaction as the change it
 * records, so the balance always equals the sum of its history.
 */
@Entity('inventory_items')
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'enum', enum: InventoryCategory })
  category!: InventoryCategory;

  /** کالا: what it is — «Supe Line», «نخ بخیه نایلونی», «کامپوزیت». */
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand!: string | null;

  /** مدل، سایز یا رنگ, as written: «4x10», «A2», «4/0». */
  @Column({ type: 'varchar', length: 120, nullable: true })
  spec!: string | null;

  @Column({ type: 'enum', enum: InventoryUnit, default: InventoryUnit.Piece })
  unit!: InventoryUnit;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  /**
   * حداقل موجودی: at or under this the item is due for reordering. Null for
   * an item nobody reorders by level — many sizes are kept on the list
   * without being stocked.
   */
  @Column({ type: 'int', nullable: true })
  minQuantity!: number | null;

  /** The last day the nearest-expiring stock on the shelf is good for. */
  @Index()
  @Column({ type: 'date', nullable: true })
  expiresOn!: Date | null;

  /** The same expiry as printed on the pack, in its own calendar: `2028/07`, `1407/05`. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  expiryText!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /**
   * Category, folded name, brand and spec — see `identityKey`. Unique among
   * active items, so one product's stock is never split across two rows.
   */
  @Column({ type: 'varchar', length: 400 })
  identityKey!: string;

  @Column({ type: 'text', default: '' })
  searchText!: string;

  @OneToMany(() => InventoryMovement, (m) => m.item)
  movements!: InventoryMovement[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Bumped by every edit and every movement: a movement can change the
   * expiry, so an edit form loaded before it must not write the old one back.
   */
  @VersionColumn()
  version!: number;

  /** Archived — no longer stocked. Its history stays; it can be restored. */
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
