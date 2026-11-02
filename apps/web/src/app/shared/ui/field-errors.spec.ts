import { FormControl, Validators } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { subscriptSizing } from './field-errors';

describe('subscriptSizing', () => {
  it('keeps a line under an untouched field, even an invalid one, so its error does not push the form down', () => {
    const required = new FormControl('', Validators.required);
    expect(subscriptSizing(required, null)).toBe('fixed');
  });

  it('lets a showing error or hint wrap below instead of running over the next field', () => {
    const required = new FormControl('', Validators.required);
    required.markAsTouched();
    expect(subscriptSizing(required, null)).toBe('dynamic');
    expect(subscriptSizing(new FormControl(''), 'e.g. 1370/05/12')).toBe('dynamic');
  });

  it('goes back to the kept line once the error is fixed', () => {
    const required = new FormControl('', Validators.required);
    required.markAsTouched();
    required.setValue('10234');
    expect(subscriptSizing(required, null)).toBe('fixed');
  });

  it('keeps no line in a list row until there is something to say', () => {
    expect(subscriptSizing(new FormControl(''), null, 'dynamic')).toBe('dynamic');
    expect(subscriptSizing(null, null)).toBe('fixed');
  });
});
