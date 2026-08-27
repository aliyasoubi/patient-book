import { EducationLevel, Gender, ReferralKind, AbutmentType } from '../model/enums';
import { normalizePersian } from './persian-text';

/**
 * Folding rules for the free-text columns of the source spreadsheet, where the
 * same answer appears under several spellings. These encode how this practice
 * reads its own records, which makes them domain knowledge rather than parsing
 * utilities. Each classifier keeps the
 * original string on the entity so nothing is lost — these only decide which
 * bucket the record filters and groups under.
 */

/** جنسیت — the sheet contains "زن", "مرد" plus typos like "ز ن" and a bare "ن". */
export function classifyGender(raw: string | null | undefined): Gender {
  const v = normalizePersian(raw).replace(/\s+/g, '');
  if (!v) return Gender.Unknown;
  if (['زن', 'ز', 'ن', 'مونث', 'خانم', 'female', 'f'].includes(v.toLowerCase())) return Gender.Female;
  if (['مرد', 'م', 'مذکر', 'اقا', 'آقا', 'male', 'm'].includes(v.toLowerCase())) return Gender.Male;
  return Gender.Unknown;
}

/**
 * تحصیلات — لیسانس and کارشناسی are one degree; so are فوق لیسانس,
 * کارشناسی ارشد and ارشد; so are دکتری and دکترا.
 */
export function classifyEducation(raw: string | null | undefined): EducationLevel {
  const v = normalizePersian(raw);
  if (!v) return EducationLevel.Unknown;

  // Order matters: "فوق دیپلم" must not fall through to the "دیپلم" test, and
  // "کارشناسی ارشد" must not be read as plain "کارشناسی".
  if (/دکتر|phd|دکترا/i.test(v)) return EducationLevel.Doctorate;
  if (/فوق\s*لیسانس|کارشناسی\s*ارشد|^ارشد$|ارشد/.test(v)) return EducationLevel.Master;
  if (/فوق\s*دیپلم|کاردانی/.test(v)) return EducationLevel.Associate;
  if (/لیسانس|کارشناسی/.test(v)) return EducationLevel.Bachelor;
  if (/دیپلم/.test(v)) return EducationLevel.Diploma;
  if (/محصل|دانش\s*اموز|دانشجو/.test(v)) return EducationLevel.Student;
  if (/ابتدایی|سیکل|بی\s*سواد|زیر\s*دیپلم|راهنمایی/.test(v)) return EducationLevel.Primary;
  if (/ندارد|هیچ/.test(v)) return EducationLevel.None;
  return EducationLevel.Other;
}

/** نحوه آشنایی — bucket the 93 distinct spellings into a handful of channels. */
export function classifyReferral(raw: string | null | undefined): ReferralKind {
  const v = normalizePersian(raw);
  if (!v) return ReferralKind.Other;
  if (/دکتر|دندانپزشک|کلینیک|مطب|بیمارستان|درمانگاه/.test(v)) return ReferralKind.Professional;
  if (/اینستا|اینستاگرام|تلگرام|واتس|شبکه\s*اجتماعی|instagram|telegram/i.test(v))
    return ReferralKind.Social;
  if (/سایت|وب|گوگل|اینترنت|google|site/i.test(v)) return ReferralKind.Website;
  if (/تبلیغ|بنر|تراکت|بیلبورد|بروشور/.test(v)) return ReferralKind.Advertising;
  if (/معرفی|اشنا|دوست|فامیل|همکار|بستگان|همسر|مادر|پدر|خواهر|برادر/.test(v))
    return ReferralKind.Patient;
  // A bare personal name in this column is someone who sent the patient in.
  return ReferralKind.Patient;
}

/** هیلینگ یا کاور اسکرو — which component was placed. */
export function classifyAbutment(raw: string | null | undefined): AbutmentType {
  const v = normalizePersian(raw);
  if (!v) return AbutmentType.Unknown;
  const hasCover = /کاور|cover/i.test(v);
  const hasHealing = /هیلینگ|هیلنگ|healing/i.test(v);
  if (hasCover && hasHealing) return AbutmentType.Both;
  if (hasCover) return AbutmentType.Cover;
  if (hasHealing) return AbutmentType.Healing;
  return AbutmentType.Other;
}

/**
 * Implant systems the practice uses, as written in the tooth-position phrase.
 * The brand is always the leading token before the first comma.
 */
const IMPLANT_BRANDS: Array<[RegExp, string]> = [
  [/زیمر|zimmer/i, 'زیمر'],
  [/دنتیوم|dentium/i, 'دنتیوم'],
  [/اشترومن|اشتراومن|straumann/i, 'اشترومن'],
  [/نئوبایوتک|neobiotech/i, 'نئوبایوتک'],
  [/اسکای|sky|bredent/i, 'اسکای'],
  [/مگاژن|megagen/i, 'مگاژن'],
  [/اسپید|speed/i, 'اسپید'],
  [/ایمپلنتیوم|implantium/i, 'ایمپلنتیوم'],
  [/اوستم|osstem/i, 'اوستم'],
  [/نوبل|nobel/i, 'نوبل'],
  [/\btri\b/i, 'TRI'],
  [/دیو|dio/i, 'دیو'],
  [/سوپرلاین|superline/i, 'سوپرلاین'],
];

/** Pull the implant system out of a phrase like "دنتیوم، ۶ و ۷ راست پایین". */
export function extractImplantBrand(raw: string | null | undefined): string | null {
  const v = normalizePersian(raw);
  if (!v) return null;
  for (const [pattern, name] of IMPLANT_BRANDS) {
    if (pattern.test(v)) return name;
  }
  return null;
}
