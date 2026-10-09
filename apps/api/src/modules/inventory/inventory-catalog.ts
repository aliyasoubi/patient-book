import {
  InventoryCategory,
  normalizeForDisplay,
  searchKey,
  toLatinDigits,
} from '../../domain';

/**
 * The trade's own spellings: the brands a dental store buys from, each as
 * printed on its boxes, with the ways staff write and say it — «dentium»,
 * «دنتیوم», a misspelling that stuck. Every item's brand is stored as the
 * name here, so one maker is one brand in every list, search and order; a
 * brand not listed is kept as typed.
 */
export const BRANDS: ReadonlyArray<{
  name: string;
  aliases: readonly string[];
}> = [
  { name: '3M', aliases: ['3m', 'تری ام', '3m espe'] },
  { name: 'Bisco', aliases: ['بیسکو'] },
  { name: 'Coltene', aliases: ['coltène', 'کولتن', 'کلتن'] },
  { name: 'COXO', aliases: ['کوکسو'] },
  { name: 'Dentium', aliases: ['دنتیوم'] },
  { name: 'Dentsply Sirona', aliases: ['dentsply', 'دنتسپلای'] },
  { name: 'Dio', aliases: ['دیو'] },
  { name: 'EVE', aliases: ['ایو'] },
  { name: 'FGM', aliases: ['اف جی ام'] },
  { name: 'GC', aliases: ['جی سی', 'جیسی'] },
  { name: 'Ivoclar', aliases: ['ivoclar vivadent', 'ایوکلار'] },
  { name: 'Kerr', aliases: ['کر'] },
  { name: 'Kulzer', aliases: ['heraeus kulzer', 'کولزر'] },
  { name: 'Megagen', aliases: ['مگاژن', 'مگاجن'] },
  { name: 'Neobiotech', aliases: ['نئوبایوتک'] },
  { name: 'Neomax', aliases: ['نئومکس'] },
  { name: 'Nobel Biocare', aliases: ['nobel', 'نوبل'] },
  { name: 'NSK', aliases: ['ان اس کی'] },
  { name: 'Oral-B', aliases: ['oral b', 'اورال بی'] },
  { name: 'Osstem', aliases: ['اوستم'] },
  { name: 'Regen', aliases: ['رژن'] },
  { name: 'Saremco', aliases: ['سارمکو'] },
  { name: 'SDI', aliases: ['اس دی آی'] },
  { name: 'Septodont', aliases: ['سپتودونت'] },
  { name: 'Straumann', aliases: ['اشترومن', 'استرومن', 'اشتراومن'] },
  { name: 'Tokuyama', aliases: ['tokoyama', 'توکویاما'] },
  { name: 'TRI', aliases: ['تی آر آی'] },
  { name: 'Ultradent', aliases: ['اولترادنت'] },
  { name: 'Vericom', aliases: ['وریکام'] },
  { name: 'VOCO', aliases: ['ووکو'] },
  { name: 'Zimmer', aliases: ['zimmer biomet', 'زیمر'] },
];

/** One spelling of a brand: folded, and blind to spaces, dashes and dots. */
const brandKey = (s: string | null | undefined): string =>
  searchKey(s).replace(/[\s\-._]/g, '');

const BY_KEY = new Map<string, (typeof BRANDS)[number]>();
for (const brand of BRANDS) {
  for (const spelling of [brand.name, ...brand.aliases]) {
    BY_KEY.set(brandKey(spelling), brand);
  }
}

/** A brand as the catalogue spells it, or as typed when it is not listed. */
export function canonicalBrand(
  brand: string | null | undefined,
): string | null {
  const typed = normalizeForDisplay(brand);
  if (!typed) return null;
  return BY_KEY.get(brandKey(typed))?.name ?? typed;
}

/** Every way a brand is written, so a search in any of them finds it. */
export function brandSpellings(brand: string | null | undefined): string[] {
  const known = BY_KEY.get(brandKey(brand));
  return known ? [known.name, ...known.aliases] : [];
}

/** Where a size is a measurement — diameter by length, a membrane's sides. */
const MEASURED: ReadonlySet<InventoryCategory> = new Set([
  InventoryCategory.Implant,
  InventoryCategory.Prosthetic,
  InventoryCategory.Regenerative,
]);

/**
 * A size in one form. Everywhere, spaces are tidied. Where a size is a
 * measurement, it is written as the boxes print it: `4.1x10` however it was
 * typed (`4.1-10`, `4.1 x 10`, `4/1*10` with a Persian decimal slash, «1 در
 * 1/5»), a range with a dash («500 تا 1000» → `500-1000`), and platforms in
 * capitals (`RC`, `NC`). Elsewhere a slash stays a slash: `4/0` is a suture.
 */
export function normalizeSpec(
  category: InventoryCategory,
  spec: string | null | undefined,
): string | null {
  // Sizes, like identifiers, are kept in ASCII digits.
  let s = toLatinDigits(normalizeForDisplay(spec));
  if (!s) return null;
  if (!MEASURED.has(category)) return s;
  s = s
    .replace(/(\d)\s*[/٫,]\s*(?=\d)/g, '$1.')
    .replace(/(\d)\s*تا\s*(?=\d)/g, '$1-')
    .replace(/(\d)\s*(?:x|×|\*|در|dar)\s*(?=\d)/gi, '$1x')
    .replace(/\b(rc|nc|wn|rn|np|rp)\b/gi, (m) => m.toUpperCase());
  // Implant sizes write diameter-length with a dash too; a range of particle
  // sizes, the other measured kind with a dash, is never on an implant.
  if (category === InventoryCategory.Implant) {
    s = s.replace(/(\d)\s*-\s*(?=\d)/g, '$1x');
  }
  return s.replace(/ +/g, ' ').trim();
}

/**
 * Where every delivery names its lot and expiry, and a use can name the
 * patient: implants, and the grafts and membranes placed with them — what a
 * recall is traced through.
 */
export const TRACEABLE: ReadonlySet<InventoryCategory> = new Set([
  InventoryCategory.Implant,
  InventoryCategory.Regenerative,
]);
