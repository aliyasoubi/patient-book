import { Component, inject, input } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslateService } from '@ngx-translate/core';

import { firstErrorMessage } from '../field-errors';

/** Multi-line counterpart to {@link PbTextField} — addresses, notes, history. */
@Component({
  selector: 'pb-textarea-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <mat-form-field
      appearance="outline"
      [subscriptSizing]="hint() || errorText() ? 'dynamic' : 'fixed'"
    >
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
        [placeholder]="readonly() ? '' : placeholder()"
        [readonly]="readonly()"
        [attr.maxlength]="maxlength()"
      ></textarea>
      @if (readonly()) {
        <mat-icon matIconSuffix aria-hidden="true">lock</mat-icon>
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
    :host {
      display: block;
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class PbTextareaField {
  private readonly i18n = inject(TranslateService);
  readonly control = input.required<FormControl<string>>();
  readonly label = input('');
  readonly prefixIcon = input<string | null>(null);
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  readonly rows = input(3);
  readonly maxlength = input<number | null>(null);
  /**
   * Shown at full contrast but not editable — for text a role may read and
   * not change. Unlike a disabled control, the value stays legible.
   */
  readonly readonly = input(false);
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  protected errorText(): string | null {
    return firstErrorMessage(this.control().errors, this.i18n, this.errorMessages());
  }
}
