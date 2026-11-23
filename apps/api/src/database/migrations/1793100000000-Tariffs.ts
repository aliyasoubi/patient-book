import { MigrationInterface, QueryRunner } from 'typeorm';

import { loosePersianKey, normalizeForDisplay } from '../../domain';

type Row = [
  category: string,
  title: string,
  price: number | null,
  maxPrice: number | null,
  note: string | null,
];

/**
 * The practice's price list as it handed it over (Dental-Tariffs.xlsm, the
 * «تعرفه‌ها» sheet), in its order. The workbook wrote tomans; these are its
 * figures times ten, in rials like every price in the app. The fibre post had
 * a cross where its price goes, so it starts without one.
 */
/** The day the list was handed over, 2 Azar 1405: what its prices date from. */
const HANDED_OVER = '2026-11-23T12:00:00+03:30';

const TARIFFS: Row[] = [
  ['عمومی', 'ترمیم', 130_000_000, 150_000_000, null],
  ['عمومی', 'اندو تخصصی', 140_000_000, 160_000_000, null],
  ['عمومی', 'جرم‌گیری', 90_000_000, null, null],
  ['عمومی', 'روکش', 250_000_000, null, null],
  ['عمومی', 'پست ریختگی', 150_000_000, null, null],
  ['عمومی', 'فایبر پست', null, null, null],
  ['ایمپلنت', 'جراحی ایمپلنت', 400_000_000, 1_000_000_000, null],
  ['ایمپلنت', 'ایمپلنت Dentis', 400_000_000, null, null],
  ['ایمپلنت', 'ایمپلنت Dentium', 500_000_000, null, null],
  ['ایمپلنت', 'ایمپلنت TRI', 600_000_000, null, null],
  ['ایمپلنت', 'ایمپلنت اشترومن', 700_000_000, 900_000_000, null],
  ['ایمپلنت', 'Titanium', 700_000_000, null, null],
  ['ایمپلنت', 'SLA', 800_000_000, null, null],
  ['ایمپلنت', 'SLA active', 900_000_000, null, null],
  ['ایمپلنت', 'ایمپلنت Zimmer', 1_000_000_000, null, null],
  ['جراحی', 'جراحی لثه فک بالا', 350_000_000, null, null],
  ['جراحی', 'جراحی افزایش طول تاج هر دندان', 50_000_000, null, null],
  ['جراحی', 'لیزر لثه', 180_000_000, null, null],
  ['جراحی', 'جراحی عقل', 150_000_000, null, null],
  ['جراحی', 'نهفته واقعی', 250_000_000, null, null],
  ['جراحی', 'کشیدن', 100_000_000, 160_000_000, null],
  ['جراحی', 'سینوس لیفت بسته (Close)', 120_000_000, null, null],
  ['جراحی', 'سینوس لیفت باز (Open)', 300_000_000, null, null],
  ['جراحی', 'پودر استخوان', 150_000_000, null, null],
  ['زیبایی', 'لمینت', 320_000_000, 400_000_000, null],
  ['زیبایی', 'ونیر کامپوزیت', 150_000_000, 200_000_000, null],
  ['زیبایی', 'بلیچینگ مطب (Office)', 120_000_000, null, 'هر فک'],
  ['زیبایی', 'بلیچینگ خانگی (Home)', 280_000_000, null, null],
  ['ارتودنسی', 'ارتودنسی', 1_500_000_000, 3_000_000_000, null],
];

/**
 * The clinic's price list for its services. What it sells to patients is not
 * a line here: that price is the inventory item's `salePrice`, which the
 * tariff page edits in place. Each price keeps the day it last changed —
 * prices follow the calendar, and the list says how current it is.
 */
export class Tariffs1793100000000 implements MigrationInterface {
  name = 'Tariffs1793100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "tariffs" (
        "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "category"         varchar(60) NOT NULL,
        "title"            varchar(160) NOT NULL,
        "normalizedTitle"  varchar(160) NOT NULL,
        "price"            bigint,
        "maxPrice"         bigint,
        "note"             varchar(300),
        "sortOrder"        integer NOT NULL DEFAULT 0,
        "priceChangedAt"   timestamptz NOT NULL DEFAULT now(),
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        "version"          integer NOT NULL DEFAULT 1,
        CONSTRAINT "chk_tariffs_range"
          CHECK ("maxPrice" IS NULL OR ("price" IS NOT NULL AND "maxPrice" > "price"))
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "idx_tariffs_normalized_title" ON "tariffs" ("normalizedTitle")`,
    );
    for (const [
      i,
      [category, title, price, maxPrice, note],
    ] of TARIFFS.entries()) {
      await q.query(
        `INSERT INTO "tariffs"
           ("category", "title", "normalizedTitle", "price", "maxPrice", "note",
            "sortOrder", "priceChangedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          normalizeForDisplay(category),
          normalizeForDisplay(title),
          loosePersianKey(title),
          price,
          maxPrice,
          note,
          i + 1,
          HANDED_OVER,
        ],
      );
    }

    // An item's sale price changes on the tariff page too. Null until it
    // does: when a price already set was last changed is not on record.
    await q.query(
      `ALTER TABLE "inventory_items" ADD COLUMN "salePriceChangedAt" timestamptz`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "inventory_items" DROP COLUMN "salePriceChangedAt"`,
    );
    await q.query(`DROP TABLE "tariffs"`);
  }
}
