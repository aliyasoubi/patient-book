import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { adoptUntouched, changedFields } from './form-sync';

describe('adoptUntouched', () => {
  it('takes the saved value for fields left alone, keeps what the user changed', () => {
    const form = new FormGroup({
      toothPosition: new FormControl('۶ بالا'),
      notes: new FormControl(''),
    });
    form.controls.notes.setValue('یادداشت من');
    form.controls.notes.markAsDirty();

    adoptUntouched(form, { toothPosition: '۷ پایین', notes: 'یادداشت همکار' });

    expect(form.getRawValue()).toEqual({ toothPosition: '۷ پایین', notes: 'یادداشت من' });
    // Adopting is not an edit: the field still counts as untouched.
    expect(form.controls.toothPosition.pristine).toBe(true);
  });

  it('ignores values for fields the form does not have', () => {
    const form = new FormGroup({ notes: new FormControl('') });
    adoptUntouched(form, { notes: 'x', missing: 'y' });
    expect(form.getRawValue()).toEqual({ notes: 'x' });
  });
});

describe('changedFields', () => {
  it('lists the label keys of fields whose values differ', () => {
    const fields = [
      ['a.label', (r: { a: number; b: number }) => r.a],
      ['b.label', (r: { a: number; b: number }) => r.b],
    ] as const;
    expect(changedFields({ a: 1, b: 2 }, { a: 1, b: 3 }, fields)).toEqual(['b.label']);
  });
});
