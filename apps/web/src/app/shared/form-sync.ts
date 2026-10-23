import type { Signal } from '@angular/core';
import type { AbstractControl, FormGroup } from '@angular/forms';
import type { Subscription } from 'rxjs';

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

/**
 * A patient picked from the book stays picked only while the field still
 * shows their name. Typing over it is a new search, not the same patient:
 * `drop` lets the pick go, rather than saving the first patient under the
 * second one's name. Only the user's typing counts — a field still untouched
 * is being filled in by the form itself (a reset, a conflict adopting what was
 * saved), and its link is the form's to set.
 */
export function dropPickOnRetype(
  control: AbstractControl<string>,
  picked: Signal<{ fullName: string } | null>,
  drop: () => void,
): Subscription {
  return control.valueChanges.subscribe((typed) => {
    const current = picked();
    if (!current || control.pristine || typed.trim() === current.fullName.trim()) return;
    drop();
    // The validator ran before the pick was dropped; ask it again.
    control.updateValueAndValidity({ emitEvent: false });
  });
}
