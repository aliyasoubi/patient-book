import { Component, input } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { firstErrorMessage } from '../field-errors';

/**
 * The Jalali date input used on every date the practice records — birth date,
 * first/last visit, surgery date. Wraps `mat-datepicker`, which already reads
 * the Jalali calendar app-wide through the `DateAdapter` provided in
 * `app.config.ts`; this component only standardises the field's shell.
 */
@Component({
  selector: 'pb-date-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule],
  template: `
    <mat-form-field appearance="outline" [subscriptSizing]="hint() || errorText() ? 'dynamic' : 'fixed'">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <input
        matInput
        [matDatepicker]="picker"
        [formControl]="control()"
        [placeholder]="placeholder()" />
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-datepicker #picker [startView]="startView()" />
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
export class PbDateField {
  readonly control = input.required<FormControl<Date | null>>();
  readonly label = input('');
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  /** 'multi-year' opens straight to the year grid — useful for birth dates. */
  readonly startView = input<'month' | 'year' | 'multi-year'>('month');
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  protected errorText(): string | null {
    return firstErrorMessage(this.control().errors, this.errorMessages());
  }
}
