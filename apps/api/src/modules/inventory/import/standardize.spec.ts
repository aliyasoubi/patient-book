import { describe, expect, it } from '@jest/globals';

import { InventoryCategory } from '../../../domain';
import { standardize } from './standardize';

const C = InventoryCategory;
const as = (
  category: InventoryCategory,
  name: string,
  brand: string | null,
  spec: string | null,
) => standardize({ category, name, brand, spec });

describe('standardize', () => {
  it('puts a Straumann line, platform and size each in its place', () => {
    expect(
      as(C.Implant, 'Titanium-BLT-RC', 'Straumann', '4.1-10').item,
    ).toMatchObject({
      name: 'BLT Ti SLA',
      spec: 'RC 4.1x10',
    });
    expect(
      as(C.Implant, 'SLA Active_BL', 'Straumann', '3.3-12').item,
    ).toMatchObject({
      name: 'BL SLActive',
      spec: 'NC 3.3x12',
    });
  });

  it("writes a Straumann platform from the diameter, over the sheet's slip", () => {
    expect(as(C.Implant, 'SLA-BLT-RC', 'Straumann', '3.3-10').item.spec).toBe(
      'NC 3.3x10',
    );
    expect(
      as(C.Implant, 'SLA Active_BLT', 'Straumann', '4.8-8').item.spec,
    ).toBe('RC 4.8x8');
  });

  it("names Zimmer's lines by product", () => {
    expect(as(C.Implant, 'Bone Level', 'Zimmer', '3.7x10').item.name).toBe(
      'Tapered Screw-Vent',
    );
    expect(as(C.Implant, 'Tissue Level', 'Zimmer', '3.7x10').item.name).toBe(
      'Tapered SwissPlus',
    );
  });

  it('moves a product out of the brand column and its maker in', () => {
    expect(as(C.Restorative, 'کامپوزیت', '3M', 'A3 (P60 )').item).toMatchObject(
      {
        name: 'کامپوزیت Filtek P60',
        brand: '3M',
        spec: 'A3',
      },
    );
    expect(as(C.Restorative, 'کامپوزیت', 'Carisma', 'OM').item).toMatchObject({
      name: 'کامپوزیت Charisma',
      brand: 'Kulzer',
    });
  });

  it('takes the size off the end of an endodontic name', () => {
    expect(as(C.Endo, 'کا فایل 25', null, null).item).toMatchObject({
      name: 'کا فایل',
      spec: '#25',
    });
    expect(
      as(C.Endo, 'کا فایل بلند اسورت45-80', null, null).item,
    ).toMatchObject({
      name: 'کا فایل بلند',
      spec: 'اسورت #45-80',
    });
    expect(as(C.Endo, 'گوتا 30چهار درصد', null, null).item).toMatchObject({
      name: 'گوتاپرکا 4%',
      spec: '#30',
    });
    expect(as(C.Endo, 'گیتس 2', null, null).item.name).toBe('گیتس گلیدن');
  });

  it('spells a brand the catalogue way, and says nothing changed when nothing did', () => {
    expect(as(C.Restorative, 'کامپوزیت', 'tokoyama', 'BW').item.brand).toBe(
      'Tokuyama',
    );
    expect(as(C.Restorative, 'اوژنول', null, null).changed).toBe(false);
  });
});
