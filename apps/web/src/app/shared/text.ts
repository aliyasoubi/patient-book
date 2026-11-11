import { toLatinDigits } from './validators';

/**
 * A Persian string folded for a loose "does this contain that" match:
 * Arabic yeh and kaf become their Persian forms, ZWNJ and spaces go, digits
 * become ASCII and Latin letters lower case — so a word typed with a space,
 * a ZWNJ or neither, or with Arabic letters, still matches. For matching on
 * screen only; the API folds its own way (`searchKey`) for what it stores
 * and searches.
 */
export function foldPersian(text: string): string {
  return toLatinDigits(text)
    .replace(/[\u064a\u0649]/g, String.fromCharCode(0x06cc))
    .replace(/\u0643/g, String.fromCharCode(0x06a9))
    .replace(/[\u200c\u200d\s]+/g, '')
    .toLowerCase();
}
