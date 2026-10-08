import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import {
  endOfMonth as endOfJalaliMonth,
  endOfYear as endOfJalaliYear,
  isValid,
  parse as parseJalali,
} from 'date-fns-jalali';

import {
  ConflictError,
  ErrorCode,
  JalaliDate,
  searchKey,
  storedDate,
  toLatinDigits,
} from '../../domain';

/**
 * The rules of the clinic's stock, with no database and no framework: what an
 * expiry printed on a pack means, when an item is running low or about to
 * expire, and how each kind of movement changes its batches. The list's
 * filters and the dashboard's counts both use the SQL forms at the bottom, so
 * the two never disagree.
 */

/** How far ahead an expiry is worth a warning: a quarter, time to use it up or reorder. */
export const EXPIRY_WARNING_DAYS = 90;

/** On the shelf, nothing, or at or under the reorder level staff set. */
export type StockState = 'ok' | 'low' | 'out';
export type ExpiryState = 'ok' | 'expiring' | 'expired';

/**
 * An expiry as printed on the pack, and the last day it covers.
 *
 * Imported materials print a Gregorian month — «EXP 2028-07» — and Iranian
 * ones often a Jalali one, so both calendars are read, told apart by the
 * year. The text is kept in the calendar it was written in; the date is the
 * last day of the period it names (a month-only expiry runs to the end of
 * that month, as GS1 labels define it), used only for sorting and warnings.
 */
export interface Expiry {
  /** Canonical form in the calendar it was written in: `2028/07`, `1407/05/12`, `2028`. */
  text: string;
  /** The last day the stock is good for. */
  date: Date;
}

const JALALI_YEARS = [1300, 1499] as const;
const GREGORIAN_YEARS = [1900, 2199] as const;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Read an expiry: a year, a year and month, or a full date, in either order
 * printers use (`2028/07`, `07/2028`, `2028-07-31`, `31.07.2028`), Gregorian
 * or Jalali, in any digit script. `null` when it cannot be read — never a
 * guess.
 */
export function parseExpiry(input: string | null | undefined): Expiry | null {
  const raw = toLatinDigits(String(input ?? '')).trim();
  if (!raw) return null;
  const parts = raw.split(/[\s/\-.٫]+/).filter(Boolean);
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p)))
    return null;

  // The year is whichever end has four digits; the rest reads outward from it.
  let year: number;
  let month: number | null = null;
  let day: number | null = null;
  const nums = parts.map(Number);
  if (parts[0].length === 4) {
    [year, month = null, day = null] = nums;
  } else if (parts[parts.length - 1].length === 4 && parts.length > 1) {
    year = nums[nums.length - 1];
    month = nums[nums.length - 2];
    day = nums.length === 3 ? nums[0] : null;
  } else {
    return null;
  }
  if (month !== null && (month < 1 || month > 12)) return null;
  if (day !== null && (day < 1 || day > 31)) return null;

  const jalali = year >= JALALI_YEARS[0] && year <= JALALI_YEARS[1];
  const gregorian = year >= GREGORIAN_YEARS[0] && year <= GREGORIAN_YEARS[1];
  if (!jalali && !gregorian) return null;

  const text = [year, month, day]
    .filter((n): n is number => n !== null)
    .map((n, i) => (i === 0 ? String(n) : pad(n)))
    .join('/');

  let date: Date;
  if (jalali) {
    const first = parseJalali(
      `${year}/${pad(month ?? 1)}/${pad(day ?? 1)}`,
      'yyyy/MM/dd',
      new Date(),
    );
    if (!isValid(first)) return null;
    date =
      day !== null
        ? first
        : month !== null
          ? endOfJalaliMonth(first)
          : endOfJalaliYear(first);
  } else {
    // Day 0 of the next month is the last day of this one.
    date =
      day !== null
        ? new Date(year, month! - 1, day)
        : month !== null
          ? new Date(year, month, 0)
          : new Date(year, 11, 31);
    if (day !== null && date.getDate() !== day) return null;
  }
  return { text, date: startOfDay(date) };
}

export function stockState(
  quantity: number,
  minQuantity: number | null,
): StockState {
  if (quantity <= 0) return 'out';
  if (minQuantity !== null && quantity <= minQuantity) return 'low';
  return 'ok';
}

/**
 * Whether what is on the shelf is past or near its expiry. An empty shelf has
 * nothing to expire, so it has no state — the date it still carries belongs
 * to a batch already used up, and the next delivery replaces it.
 */
export function expiryState(
  expiresOn: Date | string | null,
  quantity: number,
  now = new Date(),
): ExpiryState | null {
  if (!expiresOn || quantity <= 0) return null;
  const days = differenceInCalendarDays(storedDate(expiresOn), now);
  if (days < 0) return 'expired';
  return days <= EXPIRY_WARNING_DAYS ? 'expiring' : 'ok';
}

/**
 * The last day an expiry may fall on to count as {@link ExpiryState}
 * `expiring` or worse, as the `yyyy-MM-dd` a `date` column compares with.
 */
export function expiryHorizon(now = new Date()): string {
  return JalaliDate.fromDate(addDays(now, EXPIRY_WARNING_DAYS))!.toIsoDate();
}

/** One batch on the shelf: what its packs say, and how many are left. */
export interface LotLevel {
  /** Null for a batch this movement opens. */
  id: string | null;
  lotNumber: string | null;
  expiresOn: Date | string | null;
  expiryText: string | null;
  quantity: number;
  /** When the batch arrived — the tie-break between batches of one date. */
  createdAt?: Date | string | null;
}

/** What a movement does to one batch. */
export interface LotChange<T extends LotLevel = LotLevel> {
  lot: T;
  change: number;
}

/**
 * A lot number as one spelling: trimmed, ASCII digits, upper case — so «ab12»
 * typed today and «AB۱۲» last month are the same batch.
 */
export function normalizeLot(lot: string | null | undefined): string | null {
  const value = toLatinDigits(String(lot ?? ''))
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return value || null;
}

const time = (value: Date | string | null | undefined): number =>
  value ? storedDate(value).getTime() : Number.POSITIVE_INFINITY;

/**
 * First expiring, first out: the batch that expires soonest goes first, an
 * undated one last, and of two alike the one that came in first.
 */
export function fefo<T extends LotLevel>(lots: readonly T[]): T[] {
  return [...lots].sort(
    (a, b) =>
      time(a.expiresOn) - time(b.expiresOn) ||
      time(a.createdAt) - time(b.createdAt),
  );
}

/** The nearest expiry of what is on the shelf — what a warning is about. */
export function nearestExpiry(lots: readonly LotLevel[]): {
  expiresOn: Date | string | null;
  expiryText: string | null;
} {
  const next = fefo(lots).find((l) => l.quantity > 0 && l.expiresOn);
  return {
    expiresOn: next?.expiresOn ?? null,
    expiryText: next?.expiryText ?? null,
  };
}

const insufficient = (available: number, wanted: number): ConflictError =>
  new ConflictError(
    ErrorCode.InventoryInsufficientStock,
    { available },
    `Cannot take ${wanted} out of ${available}`,
  );

/**
 * A delivery: into the batch with the same lot number and expiry when there
 * is one — the same batch delivered twice — or a new batch.
 */
export function receive<T extends LotLevel>(
  lots: readonly T[],
  delivery: {
    quantity: number;
    lotNumber?: string | null;
    expiry?: Expiry | null;
  },
): LotChange<T | LotLevel> {
  const lotNumber = normalizeLot(delivery.lotNumber);
  const expiryText = delivery.expiry?.text ?? null;
  const same = lots.find(
    (l) => l.lotNumber === lotNumber && l.expiryText === expiryText,
  );
  return {
    lot: same ?? {
      id: null,
      lotNumber,
      expiresOn: delivery.expiry?.date ?? null,
      expiryText,
      quantity: 0,
    },
    change: delivery.quantity,
  };
}

/**
 * A use or a discard: from the batch named, or else first-expiring first,
 * across as many batches as it takes. Nothing may leave a shelf that does not
 * hold it; a shelf that holds less than the record is corrected by a count.
 */
export function take<T extends LotLevel>(
  lots: readonly T[],
  quantity: number,
  lotId?: string | null,
): LotChange<T>[] {
  if (lotId) {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot || lot.quantity < quantity) {
      throw insufficient(lot?.quantity ?? 0, quantity);
    }
    return [{ lot, change: -quantity }];
  }
  const available = lots.reduce((n, l) => n + l.quantity, 0);
  if (available < quantity) throw insufficient(available, quantity);
  const changes: LotChange<T>[] = [];
  let left = quantity;
  for (const lot of fefo(lots)) {
    if (left === 0) break;
    const from = Math.min(lot.quantity, left);
    if (from > 0) changes.push({ lot, change: -from });
    left -= from;
  }
  return changes;
}

/**
 * A stocktake of the item as a whole. What is missing is taken from the
 * first-expiring batches, which should have gone first; what is found extra
 * joins the last batch to arrive, or a new undated one on an empty record.
 */
export function count<T extends LotLevel>(
  lots: readonly T[],
  counted: number,
): LotChange<T | LotLevel>[] {
  const held = lots.reduce((n, l) => n + l.quantity, 0);
  if (counted < held) return take(lots, held - counted);
  if (counted === held) return [];
  const latest = [...lots].sort(
    (a, b) => time(b.createdAt) - time(a.createdAt),
  )[0];
  return [
    receive(latest ? [latest] : [], {
      quantity: counted - held,
      lotNumber: latest?.lotNumber,
      expiry:
        latest?.expiresOn && latest.expiryText
          ? { date: storedDate(latest.expiresOn), text: latest.expiryText }
          : null,
    }),
  ];
}

/**
 * The search form of an item's text. On top of the Persian folding, sizes are
 * written every way on the shelf — `4x10`, `4 x 10`, `4*10`, `4.1-10`, and
 * `4/1` for 4.1 on a Persian keyboard — so the separators between two digits
 * fold to one form, and the same query finds them all.
 */
export function inventorySearchKey(text: string | null | undefined): string {
  return searchKey(text)
    .replace(/(\d)\s*[x×*-]\s*(?=\d)/g, '$1x')
    .replace(/(\d)[/٫](?=\d)/g, '$1.');
}

/** What a search reaches: everything written on the item. */
export function itemSearchText(item: {
  name: string;
  brand: string | null;
  spec: string | null;
  notes: string | null;
}): string {
  return inventorySearchKey(
    [item.name, item.brand, item.spec, item.notes].filter(Boolean).join(' '),
  );
}

/**
 * One row per thing on the shelf: two active items may not share all four, or
 * the stock of one product would be split across both and neither balance
 * would be right.
 */
export function identityKey(item: {
  category: string;
  name: string;
  brand: string | null;
  spec: string | null;
}): string {
  return [item.category, item.name, item.brand ?? '', item.spec ?? '']
    .map((part) => inventorySearchKey(part))
    .join('|');
}

/**
 * SQL for "below the reorder level staff set" — the dashboard's count. An item
 * nobody gave a level to is not counted at zero: plenty of sizes are kept on
 * the list without being stocked, and a permanent warning teaches people to
 * ignore it.
 */
export function reorderSql(alias: string): string {
  return `(${alias}."minQuantity" IS NOT NULL AND ${alias}."quantity" <= ${alias}."minQuantity")`;
}

/**
 * SQL for {@link expiryState} `expiring` or `expired`, with `horizon` the
 * parameter holding {@link expiryHorizon} as `yyyy-MM-dd`.
 */
export function expirySoonSql(alias: string, horizon: string): string {
  return `(${alias}."quantity" > 0 AND ${alias}."expiresOn" IS NOT NULL AND ${alias}."expiresOn" <= ${horizon})`;
}
