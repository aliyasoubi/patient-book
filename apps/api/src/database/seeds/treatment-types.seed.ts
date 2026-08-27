/**
 * The thirteen procedures the practice already tracked as columns in its
 * spreadsheet. Icon names are Material Symbols ligatures, verified against the
 * bundled font so none of them render as a blank box.
 */
export interface TreatmentSeed {
  code: string;
  nameFa: string;
  nameEn: string;
  /** Source spreadsheet column header this came from. */
  sheetColumn: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export const TREATMENT_TYPES: TreatmentSeed[] = [
  { code: 'veneer',       nameFa: 'لمینت',           nameEn: 'Veneer',        sheetColumn: 'لمینت',           icon: 'layers',             color: 'violet', sortOrder: 10 },
  { code: 'composite',    nameFa: 'کامپوزیت',        nameEn: 'Composite',     sheetColumn: 'کامپوزیت',        icon: 'colorize',           color: 'sky',    sortOrder: 20 },
  { code: 'implant',      nameFa: 'ایمپلنت',         nameEn: 'Implant',       sheetColumn: 'ایمپلنت',         icon: 'deployed_code',      color: 'indigo', sortOrder: 30 },
  { code: 'extraction',   nameFa: 'کشیدن دندان',     nameEn: 'Extraction',    sheetColumn: 'کشیدن دندان',     icon: 'content_cut',        color: 'rose',   sortOrder: 40 },
  { code: 'root_canal',   nameFa: 'درمان ریشه',      nameEn: 'Root canal',    sheetColumn: 'درمان ریشه',      icon: 'healing',            color: 'amber',  sortOrder: 50 },
  { code: 'orthodontics', nameFa: 'ارتودنسی',        nameEn: 'Orthodontics',  sheetColumn: 'ارتودنسی',        icon: 'straighten',         color: 'cyan',   sortOrder: 60 },
  { code: 'filling',      nameFa: 'پرکردن دندان',    nameEn: 'Filling',       sheetColumn: 'پرکردن دندان',    icon: 'format_paint',       color: 'teal',   sortOrder: 70 },
  { code: 'crown',        nameFa: 'روکش دندان',      nameEn: 'Crown',         sheetColumn: 'روکش دندان',      icon: 'diamond',            color: 'purple', sortOrder: 80 },
  { code: 'sinus_lift',   nameFa: 'جراحی سینوس',     nameEn: 'Sinus lift',    sheetColumn: 'جراحی سینوس',     icon: 'surgical',           color: 'orange', sortOrder: 90 },
  { code: 'scaling',      nameFa: 'جرم گیری',        nameEn: 'Scaling',       sheetColumn: 'جرم گیری',        icon: 'cleaning_services',  color: 'green',  sortOrder: 100 },
  { code: 'bleaching',    nameFa: 'بلیچینگ',         nameEn: 'Bleaching',     sheetColumn: 'بلیچینگ',         icon: 'light_mode',         color: 'lime',   sortOrder: 110 },
  { code: 'gum_lift',     nameFa: 'جراحی لیفت لثه',  nameEn: 'Gum lift',      sheetColumn: 'جراحی لیفت لثه',  icon: 'expand',             color: 'pink',   sortOrder: 120 },
  { code: 'polishing',    nameFa: 'پالیش',           nameEn: 'Polishing',     sheetColumn: 'پالیش',           icon: 'star_shine',         color: 'blue',   sortOrder: 130 },
];
