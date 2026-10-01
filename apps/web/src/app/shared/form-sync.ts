import type { FormGroup } from '@angular/forms';

/** A field a conflict message can name: its label key, and how to read it. */
export type FieldReader<T> = readonly [labelKey: string, read: (record: T) => unknown];

/**
 * Label keys of the fields that differ between two copies of a record — what
 * a conflict message lists so the user knows what someone else changed.
 */
export function changedFields<T>(
  before: T,
  after: T,
  fields: readonly FieldReader<T>[],
): string[] {
  return fields.filter(([, read]) => read(before) !== read(after)).map(([key]) => key);
}

/**
 * After a save is refused because someone else saved first: every field this
 * user has not touched takes what was saved, and every field they have keeps
 * their draft. Without this the retry would send the stale copy of untouched
 * fields and quietly undo the other person's edit.
 */
export function adoptUntouched(form: FormGroup, saved: Readonly<Record<string, unknown>>): void {
  for (const [name, value] of Object.entries(saved)) {
    const control = form.get(name);
    if (control?.pristine) control.setValue(value);
  }
}
