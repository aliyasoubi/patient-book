import { Component, input, output } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';

import { firstErrorMessage } from '../field-errors';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The dropdown used everywhere a field has a fixed set of choices — gender
 * and education in the patient form, the filter row above a list.
 *
 * Two binding modes, because both are genuinely the same visual element: pass
 * `[control]` inside a reactive form (patient-form), or `[value]` +
 * `(valueChange)` for signal-driven UI state like a list's filter bar. Not a
 * `FormControl` for the latter — implemented as two template branches rather
 * than conditionally binding `[formControl]` to null, because
 * `FormControlDirective` is matched by the literal presence of the attribute
 * in the template and stays active once attached regardless of what its input
 * is bound to (the same reason {@link PbTextField}'s autocomplete branches).
 */
@Component({
  selector: 'pb-select-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" [subscriptSizing]="hint() || errorText() ? 'dynamic' : 'fixed'">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }

      @if (control(); as ctrl) {
        <mat-select [formControl]="ctrl" [placeholder]="placeholder()">
          @if (anyLabel()) {
            <mat-option value="">{{ anyLabel() }}</mat-option>
          }
          @for (option of options(); track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      } @else {
        <mat-select
          [value]="value()"
          [placeholder]="placeholder()"
          (selectionChange)="onSelectionChange($event)">
          @if (anyLabel()) {
            <mat-option value="">{{ anyLabel() }}</mat-option>
          }
          @for (option of options(); track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      }

      @if (hint() && !errorText()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
      @if (errorText(); as message) {
        <mat-error>{{ message }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    :host { display: block; }
    mat-form-field { width: 100%; }
  `,
})
export class PbSelectField {
  /** Bind inside a reactive form. Omit and use `value`/`valueChange` otherwise. */
  readonly control = input<FormControl<string> | null>(null);
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  readonly options = input.required<readonly SelectOption[]>();
  readonly label = input('');
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  /** Leading "any/all" option for filter selects, e.g. "همه". Omit to require a real choice. */
  readonly anyLabel = input<string | null>(null);
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  protected errorText(): string | null {
    const ctrl = this.control();
    return ctrl ? firstErrorMessage(ctrl.errors, this.errorMessages()) : null;
  }

  protected onSelectionChange(event: MatSelectChange): void {
    this.valueChange.emit(event.value as string);
  }
}
