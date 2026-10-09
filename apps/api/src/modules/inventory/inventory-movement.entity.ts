import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { InventoryMovementKind } from '../../domain';
import { InventoryItem } from './inventory-item.entity';

/**
 * One line of an item's stock card (کاردکس): a delivery, a use, a discard or a
 * count, who recorded it, and the balance it left. Append-only — a mistake is
 * put right with a count, not by rewriting the line, so the card is also the
 * stock's audit trail.
 */
@Entity('inventory_movements')
@Index(['itemId', 'createdAt'])
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  itemId!: string;

  // Pairs with `itemId`. With this relation loaded, save() takes the id from it
  // and ignores a changed `itemId` — set both, or drop the relation (CLAUDE.md).
  @ManyToOne(() => InventoryItem, (i) => i.movements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item!: InventoryItem;

  @Column({ type: 'enum', enum: InventoryMovementKind })
  kind!: InventoryMovementKind;

  /** Signed: what came in is positive, what went out negative; a count, the difference. */
  @Column({ type: 'int' })
  change!: number;

  /** The balance this movement left — the running total of the card. */
  @Column({ type: 'int' })
  quantityAfter!: number;

  /** The batch it moved; null only on lines from before batches were kept. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  lotId!: string | null;

  /** The batch's expiry as printed, kept on the line as it was then. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  expiryText!: string | null;

  /**
   * The patient a use went into — for an implant, a graft or a membrane, what
   * a recall of its batch is traced back through.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  patientId!: string | null;

  /** Supplier and invoice, the patient's file, why it was thrown away. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  /** Who recorded it; null for the terminal import, which names itself in `username`. */
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  username!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  /**
   * The order lines were written in. One movement can write several lines in
   * one transaction — a use split across batches — and those share
   * `createdAt`, so the card is ordered by this instead. Set by the database.
   */
  @Column({ type: 'bigint', insert: false, update: false, select: false })
  seq!: string;
}
