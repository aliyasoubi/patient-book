import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { regroup } from '../../rial';
import { errorsRevealed } from '../form-submitted';
import { firstErrorMessage, hintAsNote, placeholderWithHint } from '../field-errors';
import { PbIcon } from '../icon/icon';
import { lineIconFor } from '../icon/line-icons';

let nextId = 0;

export interface TextFieldOption {
  /** What lands in the input when picked. Need not be unique — two patients can share a name. */
  value: string;
  label: string;
  /** Identity when `value` alone is ambiguous, e.g. the record behind a name. */
  id?: string;
  /** Shown in parentheses after the label — a count, a hint, etc. */
  meta?: string | number;
}

/**
 * The text input used everywhere in this app: patient names, phone numbers,
 * addresses, the login form, the referral-source autocomplete.
 *
 * Drawn like `pb-input` (label above, a quiet outlined box that takes the
 * accent and a soft lift on focus, a message that eases open below), so
 * every field in the app reads as one family. One component instead of one
 * hand-assembled field per screen means a change to how fields look or
 * announce their errors happens once.
 * Bind it straight to a typed `FormControl` — no `ControlValueAccessor`
 * indirection, since this is an internal design-system piece, not a
 * general-purpose form control for arbitrary consumers.
 */
@Component({
  selector: 'pb-text-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatIconModule, TranslatePipe, PbIcon],
  templateUrl: './text-field.html',
  styleUrl: './text-field.scss',
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
  /**
   * Kept so existing callers still compile. Hints now sit inside the box, so
   * the line under a field only ever holds an error, and it eases open on
   * its own height whichever value is passed.
   */
  readonly subscript = input<'fixed' | 'dynamic'>('fixed');
  /** Right-align as LTR — for phone numbers, file numbers, ids inside RTL text. */
  readonly ltr = input(false);
  /** Keep the digits grouped in threes as they are typed: a price in rials. */
  readonly grouped = input(false);
  /** Suggestions shown in a Material autocomplete panel as the user types. */
  readonly options = input<TextFieldOption[] | null>(null);
  /** Validator key → message, overriding the built-in default for that key. */
  readonly errorMessages = input<Readonly<Record<string, string>>>({});
  /** The full option a user picked from the panel — not just its `value`, for callers that need the rest of it (an id, a linked record). */
  readonly optionSelected = output<TextFieldOption>();

  protected readonly id = `pb-text-field-${nextId++}`;
  protected readonly messageId = `${this.id}-message`;
  /** Errors wait for the form's first submit. */
  private readonly errorsShown = errorsRevealed(() => this.control());
  protected readonly lineIcon = computed(() => lineIconFor(this.prefixIcon()));
  protected readonly revealed = signal(false);
  protected readonly visibleType = computed(() =>
    this.type() === 'password' && this.revealed() ? 'text' : this.type(),
  );
  protected readonly hasAutocomplete = computed(() => this.options() !== null);
  /** The last message shown, and whether it was an error, kept while its line closes. */
  private lastMessage = '';
  private lastWasError = false;

  /** An error shows once the field has been left; a refused save marks every field touched. */
  protected showError(): boolean {
    const control = this.control();
    return this.errorsShown() && control.invalid && this.errorText() !== null;
  }

  /** The hint, as the placeholder while empty and an in-box note after. */
  protected placeholderText(): string {
    return placeholderWithHint(this.placeholder(), this.hint());
  }

  protected showInlineHint(): boolean {
    return hintAsNote(this.placeholder(), this.hint(), this.control().value);
  }

  protected message(): string | null {
    return this.showError() ? this.errorText() : null;
  }

  protected messageIsError(): boolean {
    if (this.message()) this.lastWasError = this.showError();
    return this.lastWasError;
  }

  protected messageText(): string {
    const current = this.message();
    if (current) this.lastMessage = current;
    return this.lastMessage;
  }

  private errorText(): string | null {
    return firstErrorMessage(this.control().errors, this.i18n, this.errorMessages());
  }

  protected groupDigits(event: Event): void {
    if (!this.grouped()) return;
    const field = event.target as HTMLInputElement;
    const { value, caret } = regroup(field.value, field.selectionStart ?? field.value.length);
    if (value === field.value) return;
    this.control().setValue(value);
    field.setSelectionRange(caret, caret);
  }

  /**
   * Resolved by the picked row's position, not its `value`: two options can
   * read the same — two patients called "Ali Rezaei" — and matching on the
   * text would always hand back the first one, with its record.
   */
  protected onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const index = event.source.options.toArray().indexOf(event.option);
    const option = this.options()?.[index];
    if (option) this.optionSelected.emit(option);
  }
}
