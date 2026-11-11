import {
  DestroyRef,
  computed,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { FormGroupDirective, FormResetEvent, type AbstractControl } from '@angular/forms';

/**
 * Whether a form has been submitted at least once, kept per form (per root
 * control). Fields show their errors only from then on: leaving a field
 * half-typed says nothing, the first press of save says everything. A reset
 * of the form starts it over.
 */
const flags = new WeakMap<AbstractControl, WritableSignal<boolean>>();

function flagFor(root: AbstractControl): WritableSignal<boolean> {
  let flag = flags.get(root);
  if (!flag) {
    const created = signal(false);
    flag = created;
    flags.set(root, created);
    root.events.subscribe((event) => {
      if (event instanceof FormResetEvent) created.set(false);
    });
  }
  return flag;
}

/**
 * A save was attempted: marks every control touched and lets the fields of
 * this form show their errors. Use it wherever a form is refused or a server
 * error is placed on a control, in place of `markAllAsTouched()`.
 */
export function markSubmitted(control: AbstractControl): void {
  control.markAllAsTouched();
  flagFor(control.root).set(true);
}

/**
 * For a field component: true once the form its control belongs to has been
 * submitted, through `<form (ngSubmit)>` or {@link markSubmitted}.
 */
export function errorsRevealed(control: () => AbstractControl | null): Signal<boolean> {
  const form = inject(FormGroupDirective, { optional: true });
  if (form) {
    const subscription = form.ngSubmit.subscribe(() => {
      const current = control();
      if (current) flagFor(current.root).set(true);
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
  return computed(() => {
    const current = control();
    return !!current && flagFor(current.root)();
  });
}
