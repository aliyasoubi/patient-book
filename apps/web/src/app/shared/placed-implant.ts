import type { PlacedImplant } from '../core/models/common.model';
import { formatPersianNumber } from './pipes/persian-number.pipe';

/**
 * One implant from the stock as one line: the teeth first, then the box as
 * the stock names it, its lot, how many when the teeth do not say, and what
 * the use said — «۳۶ ۳۷ — ایمپلنت · Dentium · ۴x۱۰ · LOT A-1». The lot is a
 * code read off the box, so its digits stay as printed.
 */
export function placedImplantLine(implant: PlacedImplant): string {
  // «ایمپلنت TRI» from TRI names its system once.
  const named = implant.brand && implant.name.toLowerCase().includes(implant.brand.toLowerCase());
  const box = [
    implant.name,
    named ? null : implant.brand,
    implant.spec ? formatPersianNumber(implant.spec) : null,
    implant.lotNumber ? `LOT ${implant.lotNumber}` : null,
    implant.quantity !== implant.teeth.length
      ? `× ${formatPersianNumber(implant.quantity)}`
      : null,
    implant.note,
  ]
    .filter(Boolean)
    .join(' · ');
  const teeth = formatPersianNumber(implant.teeth.join(' '));
  return teeth ? `${teeth} — ${box}` : box;
}
