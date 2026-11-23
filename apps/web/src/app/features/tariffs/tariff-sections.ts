import type { InventoryItem, Tariff } from '../../core/models/common.model';
import { toLatinDigits } from '../../shared/validators';
import { priceDate, type PriceDate } from './price-date';

/** The section of items sold to patients, apart from any heading typed for a service. */
export const PRODUCTS = '__products';

/** One line of the list: a service, or an item sold from the stock. */
export interface TariffRow {
  id: string;
  title: string;
  /** A service's note, or an item's brand and size. */
  detail: string | null;
  /** In rials; the least it costs when there is a `maxPrice`. */
  price: number | null;
  maxPrice: number | null;
  /** When the price last changed, as the list shows it; null with no price or no date. */
  changed: PriceDate | null;
  service: Tariff | null;
  product: InventoryItem | null;
}

export interface TariffSection {
  /** The service heading as typed, or {@link PRODUCTS}. */
  key: string;
  rows: TariffRow[];
}

/** Text as compared: digits, Arabic letters, half-spaces and case all one way. */
export function foldKey(text: string): string {
  return toLatinDigits(text)
    .replace(/[\u064a\u0649]/g, String.fromCharCode(0x06cc)) // Arabic yeh → Persian yeh
    .replace(/\u0643/g, String.fromCharCode(0x06a9)) // Arabic kaf → keheh
    .replace(/[\s\u200c]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The service headings, in the order the list first reaches them. */
export function tariffCategories(services: readonly Tariff[]): string[] {
  return [...new Set(services.map((t) => t.category))];
}

/** The stock's items sold to patients. */
export function soldItems(stock: readonly InventoryItem[]): InventoryItem[] {
  return stock.filter((i) => i.soldToPatients && !i.isArchived);
}

/**
 * The list as it is read: each heading's services in the practice's order,
 * then the items sold to patients. A search keeps the lines with every word
 * typed, in the title, the note, the brand or the heading. With nothing
 * narrowed, the items' section shows even when empty, as the way to add one.
 */
export function tariffSections(
  services: readonly Tariff[],
  stock: readonly InventoryItem[],
  query: string,
  group: string | null,
  now: Date = new Date(),
): TariffSection[] {
  const words = foldKey(query).split(' ').filter(Boolean);
  const matches = (...texts: (string | null)[]): boolean => {
    const haystack = foldKey(texts.filter(Boolean).join(' '));
    return words.every((w) => haystack.includes(w));
  };

  const headings = new Map<string, TariffRow[]>();
  if (group !== PRODUCTS) {
    for (const t of services) {
      if (group && t.category !== group) continue;
      if (!matches(t.title, t.note, t.category)) continue;
      const rows = headings.get(t.category) ?? [];
      rows.push({
        id: t.id,
        title: t.title,
        detail: t.note,
        price: t.price,
        maxPrice: t.maxPrice,
        changed: t.price !== null ? priceDate(t.priceChangedAt, now) : null,
        service: t,
        product: null,
      });
      headings.set(t.category, rows);
    }
  }
  const sections: TariffSection[] = [...headings].map(([key, rows]) => ({ key, rows }));

  if (!group || group === PRODUCTS) {
    const rows = soldItems(stock)
      .filter((i) => matches(i.name, i.brand, i.spec))
      .map<TariffRow>((i) => ({
        id: i.id,
        title: i.name,
        detail: [i.brand, i.spec].filter(Boolean).join(' · ') || null,
        price: i.salePrice,
        maxPrice: null,
        changed: i.salePrice !== null ? priceDate(i.salePriceChangedAt ?? null, now) : null,
        service: null,
        product: i,
      }));
    if (rows.length || !words.length) sections.push({ key: PRODUCTS, rows });
  }
  return sections;
}
