import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { InventoryItem } from './inventory-item.entity';

/**
 * One batch of an item on the shelf: the lot number and expiry printed on its
 * packs, and how many of it are left. An item's balance is the sum of its
 * batches; what goes out leaves the first-expiring batch first, and a use can
 * name its batch, which is what traces an implant or a graft to a patient.
 *
 * A batch used up stays, at zero: its stock card lines still name it.
 */
@Entity('inventory_lots')
export class InventoryLot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  itemId!: string;

  // Pairs with `itemId`. With this relation loaded, save() takes the id from it
  // and ignores a changed `itemId` — set both, or drop the relation (CLAUDE.md).
  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item!: InventoryItem;

  /** LOT on the pack, as one spelling — see `normalizeLot`. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  lotNumber!: string | null;

  /** The last day this batch is good for. */
  @Column({ type: 'date', nullable: true })
  expiresOn!: Date | null;

  /** The same expiry as printed: `2028/07`, `1407/05`. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  expiryText!: string | null;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  /** When the batch arrived — the tie-break between batches of one expiry. */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
