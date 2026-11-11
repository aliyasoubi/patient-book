import { Component, computed, inject, input } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';

import { firstErrorMessage, hintAsNote, placeholderWithHint } from '../field-errors';
import { PbIcon } from '../icon/icon';
import { lineIconFor } from '../icon/line-icons';

let nextId = 0;

/**
 * Multi-line counterpart to {@link PbTextField}: addresses, notes, history.
 * The same label, box and message as every other field; the box grows to
 * its `rows` and the icon sits on the first line.
 */
@Component({
  selector: 'pb-textarea-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, PbIcon],
  templateUrl: './textarea-field.html',
  styleUrl: './textarea-field.scss',
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
   * Shown at full contrast but not editable, for text a role may read and
   * not change. Unlike a disabled control, the value stays legible.
   */
  readonly readonly = input(false);
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  protected readonly id = `pb-textarea-${nextId++}`;
  protected readonly messageId = `${this.id}-message`;
  protected readonly lineIcon = computed(() => lineIconFor(this.prefixIcon()));
  private lastMessage = '';
  private lastWasError = false;

  protected showError(): boolean {
    const control = this.control();
    return control.touched && control.invalid && this.errorText() !== null;
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
}
