import { Component, input } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { firstErrorMessage } from '../field-errors';

/** Multi-line counterpart to {@link PbTextField} — addresses, notes, history. */
@Component({
  selector: 'pb-textarea-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <mat-form-field appearance="outline" [subscriptSizing]="hint() || errorText() ? 'dynamic' : 'fixed'">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      @if (prefixIcon()) {
        <mat-icon matIconPrefix aria-hidden="true">{{ prefixIcon() }}</mat-icon>
      }
      <textarea
        matInput
        [formControl]="control()"
        [rows]="rows()"
        [placeholder]="placeholder()"
        [attr.maxlength]="maxlength()"></textarea>
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
export class PbTextareaField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input('');
  readonly prefixIcon = input<string | null>(null);
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  readonly rows = input(3);
  readonly maxlength = input<number | null>(null);
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  protected errorText(): string | null {
    return firstErrorMessage(this.control().errors, this.errorMessages());
  }
}
