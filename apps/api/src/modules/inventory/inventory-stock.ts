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
  InventoryMovementKind,
  JalaliDate,
  searchKey,
  storedDate,
  toLatinDigits,
} from '../../domain';

/**
 * The rules of the clinic's stock, with no database and no framework: what an
 * expiry printed on a pack means, when an item is running low or about to
 * expire, and how each kind of movement changes the balance. The list's
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

/** An item's balance and the expiry of what is on the shelf. */
export interface StockLevel {
  quantity: number;
  expiresOn: Date | null;
  expiryText: string | null;
}

export interface MovementInput {
  kind: InventoryMovementKind;
  /** How many came in or went out; for a count, how many are on the shelf. */
  quantity: number;
  /** The expiry on the delivered or counted packs, when one was read. */
  expiry?: Expiry | null;
}

/** What a movement does: the change it records and the level it leaves. */
export interface MovementResult extends StockLevel {
  change: number;
}

/**
 * Apply one movement to a stock level.
 *
 * The item keeps one expiry — the nearest of what is on the shelf, which is
 * what a warning is about. A delivery onto an empty shelf brings its own
 * expiry; onto stock already there, the earlier of the two stays, since the
 * old packs are used first. A count that read a date off the packs replaces
 * it. Nothing taken out may exceed what is there: a shelf that holds less than
 * the record says is corrected with a count, not by going negative.
 */
export function applyMovement(
  level: StockLevel,
  movement: MovementInput,
): MovementResult {
  const { kind, quantity } = movement;
  const expiry = movement.expiry ?? null;
  switch (kind) {
    case InventoryMovementKind.Receive: {
      let next: Expiry | null = current(level);
      if (level.quantity <= 0) next = expiry;
      else if (expiry && (!next || expiry.date < next.date)) next = expiry;
      return {
        change: quantity,
        quantity: level.quantity + quantity,
        expiresOn: next?.date ?? null,
        expiryText: next?.text ?? null,
      };
    }
    case InventoryMovementKind.Use:
    case InventoryMovementKind.Discard:
      if (quantity > level.quantity) {
        throw new ConflictError(
          ErrorCode.InventoryInsufficientStock,
          { available: level.quantity },
          `Cannot take ${quantity} out of ${level.quantity}`,
        );
      }
      return {
        change: -quantity,
        quantity: level.quantity - quantity,
        expiresOn: level.expiresOn,
        expiryText: level.expiryText,
      };
    case InventoryMovementKind.Count:
      return {
        change: quantity - level.quantity,
        quantity,
        expiresOn: expiry ? expiry.date : level.expiresOn,
        expiryText: expiry ? expiry.text : level.expiryText,
      };
  }
}

function current(level: StockLevel): Expiry | null {
  return level.expiresOn && level.expiryText
    ? { date: storedDate(level.expiresOn), text: level.expiryText }
    : null;
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
