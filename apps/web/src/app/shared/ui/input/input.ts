import { Component, computed, inject, input, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { firstErrorMessage } from '../field-errors';
import { PbIcon } from '../icon/icon';
import type { LineIconName } from '../icon/line-icons';

let nextId = 0;

/**
 * A text input the way product sites draw one: the label sits above the box
 * and stays there, the box is a quiet 1px outline that eases into the accent
 * colour on focus and lifts on a soft neutral shadow, and a message slides open under it only
 * once there is something to say. No floating label, no notched outline.
 *
 * Nothing snaps: border, ring, icon colour and the message all move on the
 * app's short and medium durations, so the field never jumps under the
 * user's cursor. The message line keeps its last text while it closes, so
 * the words do not vanish before the space does.
 *
 * A native `<input>` with a real `<label for>`, so autofill, password
 * managers and screen readers see an ordinary field. Bind it to a typed
 * `FormControl`; the error wording comes from the same `firstErrorMessage`
 * the Material-based fields use.
 *
 * Spacing runs on the 4-step scale (4 · 8 · 12 · 16): the label sits 8 above
 * the box and 12 in from its start edge, the box is 48 tall with 16 of
 * padding before its text and 12 between icon and text, and the message
 * opens 8 below, lined up with the label, an error led by a small filled dot.
 */
@Component({
  selector: 'pb-input',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, PbIcon],
  templateUrl: './input.html',
  styleUrl: './input.scss',
})
export class PbInput {
  private readonly i18n = inject(TranslateService);

  readonly control = input.required<FormControl<string>>();
  readonly label = input('');
  readonly type = input<'text' | 'email' | 'tel' | 'password' | 'search'>('text');
  readonly prefixIcon = input<LineIconName | null>(null);
  readonly placeholder = input('');
  /** Shown under the box while there is no error. */
  readonly hint = input<string | null>(null);
  /** The native `autocomplete` attribute (browser autofill). */
  readonly nativeAutocomplete = input<string>('off');
  /** Left-aligned LTR text — credentials, ids, phone numbers. */
  readonly ltr = input(false);
  /**
   * When an error may show. Left `null`, once the field has been left
   * (touched); a boolean hands the decision to the form — `true` after its
   * first submit attempt, so nothing is flagged while the user is still typing.
   */
  readonly showErrors = input<boolean | null>(null);
  /** Whether the show-password button takes a Tab stop. */
  readonly toggleInTabOrder = input(true);
  /** Validator key → message, overriding the built-in default for that key. */
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  protected readonly id = `pb-input-${nextId++}`;
  protected readonly messageId = `${this.id}-message`;
  protected readonly revealed = signal(false);
  protected readonly visibleType = computed(() =>
    this.type() === 'password' && this.revealed() ? 'text' : this.type(),
  );
  /** The last message shown, and whether it was an error — kept while its line closes. */
  private lastMessage = '';
  private lastWasError = false;

  protected showError(): boolean {
    const control = this.control();
    const allowed = this.showErrors() ?? control.touched;
    return allowed && control.invalid && this.errorText() !== null;
  }

  protected messageIsError(): boolean {
    if (this.message()) this.lastWasError = this.showError();
    return this.lastWasError;
  }

  protected message(): string | null {
    return this.showError() ? this.errorText() : this.hint();
  }

  protected messageText(): string {
    const current = this.message();
    if (current) this.lastMessage = current;
    return this.lastMessage;
  }

  private errorText(): string | null {
    return firstErrorMessage(this.control().errors, this.i18n, this.errorMessages());
  }
}
