import { Component, computed, inject, input, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { firstErrorMessage } from '../field-errors';

export interface TextFieldOption {
  value: string;
  label: string;
  /** Shown in parentheses after the label — a count, a hint, etc. */
  meta?: string | number;
}

/**
 * The text input used everywhere in this app: patient names, phone numbers,
 * addresses, the login form, the referral-source autocomplete.
 *
 * One component instead of one hand-assembled `<mat-form-field>` per screen
 * means a change to how fields look or announce their errors happens once.
 * Bind it straight to a typed `FormControl` — no `ControlValueAccessor`
 * indirection, since this is an internal design-system piece, not a
 * general-purpose form control for arbitrary consumers.
 */
@Component({
  selector: 'pb-text-field',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe,
  ],
  template: `
    <!--
      Always 'fixed': it reserves a line of space for the hint/error slot
      whether or not one is showing, so a validation message appearing on
      blur doesn't push everything below the field down.
    -->
    <mat-form-field appearance="outline" subscriptSizing="fixed">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      @if (prefixIcon()) {
        <mat-icon matIconPrefix aria-hidden="true">{{ prefixIcon() }}</mat-icon>
      }
      <!--
        Two branches rather than one input with a conditional binding:
        MatAutocompleteTrigger's selector matches on the literal presence of
        the matAutocomplete attribute in the template, so once it is attached
        to an element it stays active for that element's lifetime — binding it
        to null does not detach it, and the trigger throws the moment the
        field is focused with no panel to open. Splitting the two cases is the
        only way to keep a plain field genuinely free of the trigger.
      -->
      @if (hasAutocomplete()) {
        <input
          matInput
          [formControl]="control()"
          [type]="visibleType()"
          [placeholder]="placeholder()"
          [attr.maxlength]="maxlength()"
          [attr.inputmode]="inputmode() || null"
          [attr.autocomplete]="nativeAutocomplete()"
          [class.ltr-input]="ltr()"
          [attr.dir]="ltr() ? 'ltr' : null"
          [matAutocomplete]="auto"
        />
        <mat-autocomplete #auto="matAutocomplete">
          @for (option of options() ?? []; track option.value) {
            <mat-option [value]="option.value">
              {{ option.label }}
              @if (option.meta) {
                <small class="pb-text-field__option-meta">({{ option.meta }})</small>
              }
            </mat-option>
          }
        </mat-autocomplete>
      } @else {
        <input
          matInput
          [formControl]="control()"
          [type]="visibleType()"
          [placeholder]="placeholder()"
          [attr.maxlength]="maxlength()"
          [attr.inputmode]="inputmode() || null"
          [attr.autocomplete]="nativeAutocomplete()"
          [class.ltr-input]="ltr()"
          [attr.dir]="ltr() ? 'ltr' : null"
        />
      }

      @if (type() === 'password') {
        <button
          matIconSuffix
          mat-icon-button
          type="button"
          (click)="revealed.set(!revealed())"
          [attr.aria-label]="
            (revealed() ? 'action.hidePassword' : 'action.showPassword') | translate
          "
          [attr.aria-pressed]="revealed()"
        >
          <mat-icon aria-hidden="true">{{ revealed() ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
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
    /* Credentials, ids and phone numbers are Latin inside an RTL page;
       force the direction so the caret and any punctuation behave. */
    .ltr-input {
      direction: ltr;
      text-align: left;
    }
    .pb-text-field__option-meta {
      margin-inline-start: 6px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PbTextField {
  private readonly i18n = inject(TranslateService);
  readonly control = input.required<FormControl<string>>();
  readonly label = input('');
  readonly type = input<'text' | 'email' | 'tel' | 'password' | 'number' | 'search'>('text');
  readonly prefixIcon = input<string | null>(null);
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  readonly maxlength = input<number | null>(null);
  readonly inputmode = input<'text' | 'tel' | 'numeric' | 'email' | 'search' | null>(null);
  /** The native `autocomplete` attribute (browser autofill), not the option panel. */
  readonly nativeAutocomplete = input<string>('off');
  /** Right-align as LTR — for phone numbers, file numbers, ids inside RTL text. */
  readonly ltr = input(false);
  /** Suggestions shown in a Material autocomplete panel as the user types. */
  readonly options = input<TextFieldOption[] | null>(null);
  /** Validator key → message, overriding the built-in default for that key. */
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  protected readonly revealed = signal(false);
  protected readonly visibleType = computed(() =>
    this.type() === 'password' && this.revealed() ? 'text' : this.type(),
  );
  protected readonly hasAutocomplete = computed(() => this.options() !== null);

  protected errorText(): string | null {
    return firstErrorMessage(this.control().errors, this.i18n, this.errorMessages());
  }
}
