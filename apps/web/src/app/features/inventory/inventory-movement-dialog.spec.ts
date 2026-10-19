import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { dropPickOnRetype } from './inventory-movement-dialog';

interface Pick {
  id: string;
  fullName: string;
}

/** The dialog's patient field: a name typed must be a name picked. */
function field() {
  const picked = signal<Pick | null>(null);
  const control = new FormControl('', {
    nonNullable: true,
    validators: (c) => (c.value.trim() && !picked() ? { pick: true } : null),
  });
  dropPickOnRetype(control, picked);
  // What picking an option does: the link, then the name without an event.
  const pick = (p: Pick) => {
    picked.set(p);
    control.setValue(p.fullName, { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
  };
  return { picked, control, pick };
}

const first: Pick = { id: 'patient-a', fullName: 'بیمار اول' };
const second: Pick = { id: 'patient-b', fullName: 'بیمار دوم' };

describe('dropPickOnRetype', () => {
  it('drops the picked patient when another name is typed over it', () => {
    const { picked, control, pick } = field();
    pick(first);
    expect(control.valid).toBe(true);

    control.setValue(second.fullName);

    expect(picked()).toBeNull();
    expect(control.errors).toEqual({ pick: true });
  });

  it('keeps the newly picked patient after a retype', () => {
    const { picked, control, pick } = field();
    pick(first);
    control.setValue('بیمار');
    pick(second);

    expect(picked()?.id).toBe('patient-b');
    expect(control.valid).toBe(true);
  });

  it('keeps the pick while the name shown is still theirs', () => {
    const { picked, control, pick } = field();
    pick(first);

    control.setValue(` ${first.fullName} `);

    expect(picked()?.id).toBe('patient-a');
    expect(control.valid).toBe(true);
  });

  it('leaves a cleared field valid and unlinked', () => {
    const { picked, control, pick } = field();
    pick(first);

    control.setValue('');

    expect(picked()).toBeNull();
    expect(control.valid).toBe(true);
  });
});
