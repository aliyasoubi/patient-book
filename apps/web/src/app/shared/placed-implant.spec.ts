import { describe, expect, it } from 'vitest';

import type { PlacedImplant } from '../core/models/common.model';
import { placedImplantLine } from './placed-implant';

const implant = (over: Partial<PlacedImplant> = {}): PlacedImplant => ({
  teeth: [36],
  name: 'SuperLine',
  brand: 'Dentium',
  spec: '4x10',
  lotNumber: 'A-1',
  quantity: 1,
  note: null,
  ...over,
});

describe('placedImplantLine', () => {
  it('starts with the teeth, then the box and its lot', () => {
    expect(placedImplantLine(implant())).toBe('۳۶ — SuperLine · Dentium · ۴x۱۰ · LOT A-1');
  });

  it('keeps what the use said, and says how many only when the teeth do not', () => {
    expect(placedImplantLine(implant({ teeth: [36, 37], quantity: 2, note: 'فوری' }))).toBe(
      '۳۶ ۳۷ — SuperLine · Dentium · ۴x۱۰ · LOT A-1 · فوری',
    );
    expect(placedImplantLine(implant({ quantity: 2 }))).toBe(
      '۳۶ — SuperLine · Dentium · ۴x۱۰ · LOT A-1 · × ۲',
    );
  });

  it('names the system once when the item is named after it', () => {
    expect(placedImplantLine(implant({ name: 'ایمپلنت TRI', brand: 'TRI', lotNumber: null }))).toBe(
      '۳۶ — ایمپلنت TRI · ۴x۱۰',
    );
  });

  it('leaves out what the box does not say', () => {
    expect(placedImplantLine(implant({ teeth: [], brand: null, lotNumber: null }))).toBe(
      'SuperLine · ۴x۱۰',
    );
  });

  it('counts a use from before the tooth was asked for only when it took more than one', () => {
    expect(placedImplantLine(implant({ teeth: [] }))).toBe('SuperLine · Dentium · ۴x۱۰ · LOT A-1');
    expect(placedImplantLine(implant({ teeth: [], quantity: 3 }))).toBe(
      'SuperLine · Dentium · ۴x۱۰ · LOT A-1 · × ۳',
    );
  });
});
