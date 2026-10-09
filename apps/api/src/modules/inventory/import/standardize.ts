import { InventoryCategory, searchKey } from '../../../domain';
import { canonicalBrand, normalizeSpec } from '../inventory-catalog';

/**
 * The workbook's names put into the shape every item takes from here on:
 * `name` the product — what it is, the same for all its sizes and shades —
 * `brand` its maker as the catalogue spells it, and `spec` the size, shade or
 * model that tells one item of a product from the next. The sheets mixed the
 * three («A1 Z250» under «3M», a product in the brand column, sizes inside
 * names) and spelled them several ways; this undoes that once, at import,
 * and the import's preview lists every change for review.
 *
 * Only what the workbook says is rearranged: a product is named where a
 * column names it (Z250, Charisma, Choice 2), never guessed from a shade.
 */

export interface Named {
  category: InventoryCategory;
  name: string;
  brand: string | null;
  spec: string | null;
}

type Fields = Omit<Named, 'category'>;

const C = InventoryCategory;
const same = (a: string | null, b: string | null): boolean =>
  searchKey(a ?? '') === searchKey(b ?? '');

/**
 * Products this workbook names, by category and how the sheet wrote them.
 * `brand: undefined` in a match is any brand; `null` is none.
 */
const PRODUCTS: ReadonlyArray<
  [
    match: {
      category: InventoryCategory;
      name: string;
      brand?: string | null;
      spec?: string;
    },
    to: Partial<Fields> | ((f: Fields) => Partial<Fields>),
  ]
> = [
  // Implants: one spelling per line, platform with the size.
  [{ category: C.Implant, name: 'Supe Line' }, { name: 'SuperLine' }],
  [{ category: C.Implant, name: 'Slim Line' }, { name: 'SlimLine' }],

  // Prosthetic parts named in Latin shorthand.
  [
    { category: C.Prosthetic, name: 'angel abut 15' },
    (f) => ({
      name: 'اباتمنت زاویه‌دار',
      spec: ['15°', f.spec].filter(Boolean).join(' · '),
    }),
  ],
  [{ category: C.Prosthetic, name: 'Analog' }, { name: 'آنالوگ' }],
  [{ category: C.Prosthetic, name: 'Cover Screw' }, { name: 'کاور اسکرو' }],
  [
    { category: C.Prosthetic, name: 'Scew abutment' },
    { name: 'اسکرو اباتمنت' },
  ],

  // Composites: the sheet's brand column held makers and products alike.
  [
    { category: C.Restorative, name: 'کامپوزیت', brand: '3M' },
    (f) => {
      const [, shade, product] =
        /^(\S+)\s*\(?\s*([A-Z]\d+)\s*\)?$/i.exec(f.spec ?? '') ?? [];
      return product
        ? { name: `کامپوزیت Filtek ${product.toUpperCase()}`, spec: shade }
        : {};
    },
  ],
  [
    { category: C.Restorative, name: 'کامپوزیت', brand: 'Carisma' },
    { name: 'کامپوزیت Charisma', brand: 'Kulzer' },
  ],
  [
    { category: C.Restorative, name: 'کامپوزیت', brand: 'DenFil' },
    { name: 'کامپوزیت Denfil', brand: 'Vericom' },
  ],
  [
    { category: C.Restorative, name: 'کامپوزیت', brand: 'Gradia' },
    { name: 'کامپوزیت Gradia Direct', brand: 'GC' },
  ],
  [
    { category: C.Restorative, name: 'کامپوزیت', brand: 'Gaenial' },
    { name: 'کامپوزیت G-aenial', brand: 'GC' },
  ],
  [
    { category: C.Restorative, name: 'کامپوزیت', brand: 'FLOW' },
    { name: 'کامپوزیت فلو', brand: null },
  ],
  [
    { category: C.Restorative, name: 'کامپوزیت', brand: 'Duo-link' },
    { name: 'سمان Duo-Link', brand: 'Bisco', spec: null },
  ],

  // Veneer materials: the sheet's brand column named the product.
  [
    { category: C.Restorative, name: 'لمینت', brand: 'Choice 2' },
    { name: 'سمان لمینت Choice 2', brand: 'Bisco' },
  ],
  [
    { category: C.Restorative, name: 'لمینت', brand: 'TEMPORARY روکش موقت' },
    { name: 'روکش موقت', brand: null },
  ],
  [
    { category: C.Restorative, name: 'لمینت', brand: 'اچ پرسلن' },
    { name: 'اچ پرسلن', brand: 'Bisco', spec: null },
  ],
  [
    { category: C.Restorative, name: 'لمینت', brand: 'سایلن' },
    { name: 'سایلن', brand: 'Bisco', spec: null },
  ],

  // The general store: makers and models written into names.
  [
    { category: C.Restorative, name: 'گلس کف بندی sdi' },
    { name: 'گلس آینومر کف‌بندی', brand: 'SDI' },
  ],
  [
    { category: C.Restorative, name: 'گلس کف بندی GC' },
    { name: 'گلس آینومر کف‌بندی', brand: 'GC' },
  ],
  [
    { category: C.Restorative, name: 'سمان', spec: 'ketac' },
    { name: 'سمان Ketac', brand: '3M', spec: null },
  ],
  [
    { category: C.Restorative, name: 'سمان', spec: 'GC' },
    { brand: 'GC', spec: null },
  ],
  [
    { category: C.Restorative, name: 'سمان موقت', spec: 'Kerr' },
    { brand: 'Kerr', spec: null },
  ],
  [
    { category: C.Restorative, name: 'باندینگ', spec: 'amber' },
    { name: 'باندینگ Ambar', brand: 'FGM', spec: null },
  ],
  [
    { category: C.Restorative, name: 'بلیچینگ fgm قرمز' },
    { name: 'بلیچینگ مطب', brand: 'FGM', spec: 'قرمز' },
  ],
  [
    { category: C.Restorative, name: 'دیسک قهوه ای', spec: '3m' },
    { name: 'دیسک پرداخت قهوه‌ای', brand: '3M', spec: null },
  ],
  [
    { category: C.Restorative, name: 'دیسک پرداخت آبی zenit' },
    { name: 'دیسک پرداخت آبی Zenit' },
  ],
  [
    { category: C.Restorative, name: 'دیسک سبزپرسلن' },
    { name: 'دیسک پرداخت پرسلن سبز', brand: 'EVE', spec: null },
  ],
  [{ category: C.Restorative, name: 'دیسک زرد' }, { name: 'دیسک پرداخت زرد' }],
  [
    { category: C.Restorative, name: 'میکرو براش سبز' },
    { name: 'میکروبراش', spec: 'سبز' },
  ],
  [
    { category: C.Restorative, name: 'میکروبراش بنفش' },
    { name: 'میکروبراش', spec: 'بنفش' },
  ],
  [
    { category: C.Restorative, name: 'میکرو براش کانال' },
    { name: 'میکروبراش', spec: 'کانال' },
  ],
  [
    { category: C.Restorative, name: 'نخ زیر لثه التراپک' },
    { name: 'نخ زیر لثه', brand: 'Ultradent', spec: 'Ultrapak' },
  ],
  [
    { category: C.Restorative, name: 'ALUM-STOP' },
    { name: 'ژل بندآورنده خون ALUM-STOP', spec: null },
  ],
  [
    { category: C.Restorative, name: 'فایبرپست' },
    (f) => ({ spec: f.spec ? `#${f.spec}` : null }),
  ],
  [
    { category: C.Restorative, name: 'مولت پروانه ای' },
    { name: 'مولت پروانه‌ای' },
  ],

  // Anaesthesia: one spelling, needles as one product by length.
  [{ category: C.Anesthesia, name: 'لیدوکایین' }, { name: 'لیدوکائین' }],
  [{ category: C.Anesthesia, name: 'ارتی کائین' }, { name: 'آرتیکائین' }],
  [{ category: C.Anesthesia, name: 'ژل بی حسی' }, { name: 'ژل بی‌حسی' }],
  [
    { category: C.Anesthesia, name: '(L) نیدل' },
    { name: 'نیدل', spec: 'بلند (L)' },
  ],
  [
    { category: C.Anesthesia, name: '(S) نیدل' },
    { name: 'نیدل', spec: 'کوتاه (S)' },
  ],
  [
    { category: C.Anesthesia, name: '(اطفال) نیدل' },
    { name: 'نیدل', spec: 'اطفال' },
  ],

  // Impression materials: the maker out of the name.
  [
    { category: C.Impression, name: 'پوتی KULZER' },
    { name: 'پوتی', brand: 'Kulzer' },
  ],
  [
    { category: C.Impression, name: 'مونوفاز KULZER' },
    { name: 'مونوفاز', brand: 'Kulzer' },
  ],
  [
    { category: C.Impression, name: 'اکسترالایت KULZER' },
    { name: 'اکسترا لایت', brand: 'Kulzer' },
  ],
  [
    { category: C.Impression, name: 'مدیوم فلو KULZER' },
    { name: 'مدیوم فلو', brand: 'Kulzer' },
  ],
  [
    { category: C.Impression, name: 'پوتی اسپیدکس' },
    { name: 'پوتی', brand: 'Coltene', spec: 'Speedex' },
  ],

  // Endodontics, beyond the sizes split off below.
  [
    { category: C.Endo, name: 'سیلرAH plus' },
    { name: 'سیلر AH Plus', brand: 'Dentsply Sirona' },
  ],
  [{ category: C.Endo, name: 'chloroform' }, { name: 'کلروفرم' }],
  [{ category: C.Endo, name: 'cem cement' }, { name: 'سمان CEM' }],
  [{ category: C.Endo, name: 'هیپو' }, { name: 'هیپوکلریت سدیم' }],
  [
    { category: C.Endo, name: 'کلسیم هیدرواکساید' },
    { name: 'کلسیم هیدروکساید' },
  ],
  [
    { category: C.Endo, name: 'گوتا mf' },
    { name: 'گوتاپرکا', spec: 'MF' },
  ],
  [
    { category: C.Endo, name: 'فایل روتاری sx' },
    { name: 'فایل روتاری', spec: 'SX' },
  ],
  [
    { category: C.Endo, name: 'فایل روتاری rshaper' },
    { name: 'فایل روتاری', spec: 'R-Shaper' },
  ],

  // Surgery.
  [
    { category: C.Surgery, name: 'ست سرم NSK' },
    { name: 'ست سرم', brand: 'NSK' },
  ],
  [
    { category: C.Surgery, name: 'خمیر جراحی جی سی' },
    { name: 'خمیر جراحی', brand: 'GC' },
  ],
  [
    { category: C.Surgery, name: 'تیغ بیستوری' },
    (f) => ({ spec: f.spec ? `#${f.spec}` : null }),
  ],

  // Consumables: makers and sizes out of names.
  [
    { category: C.Consumable, name: 'دکونکس 4 لیتری' },
    { name: 'دکونکس', spec: '4 لیتری' },
  ],
  [
    { category: C.Consumable, name: 'میکروتن4لیتری' },
    { name: 'میکروتن', spec: '4 لیتری' },
  ],
  [
    { category: C.Consumable, name: 'توربین 4 سوراخه COXO' },
    { name: 'توربین', brand: 'COXO', spec: '4 سوراخه' },
  ],
  [
    { category: C.Consumable, name: 'توربین 2 سوراخه COXO' },
    { name: 'توربین', brand: 'COXO', spec: '2 سوراخه' },
  ],
  [
    { category: C.Consumable, name: 'توربین 4 سوراخه NSK' },
    { name: 'توربین', brand: 'NSK', spec: '4 سوراخه' },
  ],
  [
    { category: C.Consumable, name: 'دستکش پرمیوم لاتکس xs' },
    { name: 'دستکش لاتکس پرمیوم', spec: 'XS' },
  ],
  [
    { category: C.Consumable, name: 'دستکش نیتریل s' },
    { name: 'دستکش نیتریل', spec: 'S' },
  ],
  [
    { category: C.Consumable, name: 'دستکش ایکس اس نئومکس' },
    { name: 'دستکش', brand: 'Neomax', spec: 'XS' },
  ],
  [
    { category: C.Consumable, name: 'گاز بزرگ' },
    { name: 'گاز', spec: 'بزرگ' },
  ],
  [
    { category: C.Consumable, name: 'گاز کوچک' },
    { name: 'گاز', spec: 'کوچک' },
  ],
  [
    { category: C.Consumable, name: 'کاورسنسور فسفورپلید' },
    { name: 'کاور سنسور فسفر پلیت' },
  ],
  [
    { category: C.Consumable, name: 'نوار پرداخت امالگام' },
    { name: 'نوار پرداخت آمالگام' },
  ],

  // Hygiene: the maker and bristle out of the name.
  [
    { category: C.Hygiene, name: 'مسواک اورال بیmedume' },
    { name: 'مسواک', brand: 'Oral-B', spec: 'Medium' },
  ],
  [
    { category: C.Hygiene, name: 'مسواک اورال بیsoft' },
    { name: 'مسواک', brand: 'Oral-B', spec: 'Soft' },
  ],
  [
    { category: C.Hygiene, name: 'مسواک جراحی اورال بی' },
    { name: 'مسواک جراحی', brand: 'Oral-B' },
  ],

  // Grafts and membranes: a type in the brand column is part of the name.
  [
    { category: C.Regenerative, name: 'پودر استخوان', brand: 'سرنگی' },
    { name: 'پودر استخوان سرنگی', brand: null },
  ],
  [
    { category: C.Regenerative, name: 'پودر استخوان', brand: 'فشرده دنتیوم' },
    { name: 'پودر استخوان فشرده', brand: 'Dentium' },
  ],
  [
    { category: C.Regenerative, name: 'ممبران', brand: 'خارجی' },
    { name: 'ممبران خارجی', brand: null },
  ],
];

/** Straumann's lines as the sheet wrote them: «SLA Active_BLT», «Titanium-BLT-RC». */
const STRAUMANN =
  /^(titanium|sla active|sla)[\s_-]*(blt|bl)(?:[\s_-]*(rc|nc))?$/i;
const SURFACES: Readonly<Record<string, string>> = {
  titanium: 'Titanium',
  sla: 'SLA',
  'sla active': 'SLActive',
};

/** Endodontic names with their size on the end: «کا فایل 25», «گوتا 30چهار درصد». */
const GUTTA = /^گوتا\s*(\d+)\s*(دو|چهار|شش)\s*درصد$/;
const TAPERS: Readonly<Record<string, string>> = {
  دو: '2%',
  چهار: '4%',
  شش: '6%',
};
const SIZED = /^(.*?\D)\s*(اسورت)?\s*(\d+(?:-\d+)?)$/;
const ENDO_NAMES: Readonly<Record<string, string>> = {
  گیتس: 'گیتس گلیدن',
  پیزو: 'پیزو ریمر',
  اسپیریدر: 'اسپریدر',
};

/**
 * One item in the standard shape. `changes` says what moved, for the
 * preview; empty when the sheet already had it right.
 */
export function standardize(item: Named): { item: Named; changed: boolean } {
  let f: Fields = { name: item.name, brand: item.brand, spec: item.spec };

  for (const [match, to] of PRODUCTS) {
    if (match.category !== item.category || !same(match.name, f.name)) continue;
    if (match.brand !== undefined && !same(match.brand, f.brand)) continue;
    if (match.spec !== undefined && !same(match.spec, f.spec)) continue;
    f = { ...f, ...(typeof to === 'function' ? to(f) : to) };
    break;
  }

  const straumann = STRAUMANN.exec(f.name);
  if (item.category === C.Implant && straumann) {
    const [, surface, line, platform] = straumann;
    f = {
      ...f,
      name: `${line.toUpperCase()} ${SURFACES[surface.toLowerCase()]}`,
      spec: [platform?.toUpperCase(), f.spec].filter(Boolean).join(' ') || null,
    };
  }

  if (item.category === C.Endo && !f.spec) {
    const gutta = GUTTA.exec(f.name);
    const sized = SIZED.exec(f.name);
    if (gutta) {
      f = { ...f, name: `گوتاپرکا ${TAPERS[gutta[2]]}`, spec: `#${gutta[1]}` };
    } else if (sized) {
      const base = sized[1].trim();
      f = {
        ...f,
        name: ENDO_NAMES[base] ?? base,
        spec: [sized[2], `#${sized[3]}`].filter(Boolean).join(' '),
      };
    }
  }

  const next: Named = {
    category: item.category,
    name: f.name,
    brand: canonicalBrand(f.brand),
    spec: normalizeSpec(item.category, f.spec),
  };
  const changed =
    next.name !== item.name ||
    next.brand !== item.brand ||
    next.spec !== item.spec;
  return { item: next, changed };
}
