import { signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { adoptUntouched, changedFields, dropPickOnRetype } from './form-sync';

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

interface Pick {
  id: string;
  fullName: string;
}

/** The stock dialog's patient field: a name typed must be a name picked. */
function field() {
  const picked = signal<Pick | null>(null);
  const control = new FormControl('', {
    nonNullable: true,
    validators: (c) => (c.value.trim() && !picked() ? { pick: true } : null),
  });
  dropPickOnRetype(control, picked, () => picked.set(null));
  // What picking an option does: the link, then the name without an event.
  const pick = (p: Pick) => {
    picked.set(p);
    control.setValue(p.fullName, { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
  };
  // What a keystroke does: the field turns dirty before its value is sent.
  const type = (text: string) => {
    control.markAsDirty();
    control.setValue(text);
  };
  return { picked, control, pick, type };
}

const first: Pick = { id: 'patient-a', fullName: 'بیمار اول' };
const second: Pick = { id: 'patient-b', fullName: 'بیمار دوم' };

describe('dropPickOnRetype', () => {
  it('drops the picked patient when another name is typed over it', () => {
    const { picked, control, pick, type } = field();
    pick(first);
    expect(control.valid).toBe(true);

    type(second.fullName);

    expect(picked()).toBeNull();
    expect(control.errors).toEqual({ pick: true });
  });

  it('keeps the newly picked patient after a retype', () => {
    const { picked, control, pick, type } = field();
    pick(first);
    type('بیمار');
    pick(second);

    expect(picked()?.id).toBe('patient-b');
    expect(control.valid).toBe(true);
  });

  it('keeps the pick while the name shown is still theirs', () => {
    const { picked, control, pick, type } = field();
    pick(first);

    type(` ${first.fullName} `);

    expect(picked()?.id).toBe('patient-a');
    expect(control.valid).toBe(true);
  });

  it('leaves a cleared field valid and unlinked', () => {
    const { picked, control, pick, type } = field();
    pick(first);

    type('');

    expect(picked()).toBeNull();
    expect(control.valid).toBe(true);
  });

  it('leaves the pick alone while the form itself fills an untouched field', () => {
    const { picked, control, pick } = field();
    pick(first);

    // A reset or a conflict writing another spelling the case was saved under.
    control.setValue('بیمار اوّل');

    expect(picked()?.id).toBe('patient-a');
  });
});
