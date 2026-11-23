import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
  VersionColumn,
} from 'typeorm';

/**
 * Postgres hands a `bigint` back as a string. A price in rials runs past the
 * 2.1 billion an `int` holds — orthodontics does — and fits a JS number whole.
 */
const rials: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * One line of the clinic's price list: a service and what it costs, in rials
 * — one price, or a range from `price` to `maxPrice` where the work varies,
 * as a filling or an extraction does.
 *
 * What is sold to patients is not here. Its price is the inventory item's own
 * `salePrice`, which the tariff page edits, so the list and a sale at the desk
 * never disagree.
 */
@Entity('tariffs')
export class Tariff {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The heading it is listed under, as the practice names it: «عمومی», «ایمپلنت». */
  @Column({ type: 'varchar', length: 60 })
  category!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  /** The title folded (`loosePersianKey`): one service, one line. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  normalizedTitle!: string;

  /** In rials; the least it costs when there is a `maxPrice`. Null until set. */
  @Column({ type: 'bigint', nullable: true, transformer: rials })
  price!: number | null;

  /** In rials: the top of the range. Null for a single price. */
  @Column({ type: 'bigint', nullable: true, transformer: rials })
  maxPrice!: number | null;

  /** What the price covers or depends on: «هر فک». */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  /**
   * When the price last changed — not the title or the note. Prices follow
   * the calendar, so the list says how current each one is.
   */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  priceChangedAt!: Date;

  /** List order: the practice's own list as it was written, new lines after. */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @VersionColumn()
  version!: number;
}
