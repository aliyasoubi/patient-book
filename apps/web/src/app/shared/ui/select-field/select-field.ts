import { Component, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { errorsRevealed } from '../form-submitted';
import { firstErrorMessage, placeholderWithHint } from '../field-errors';
import { PbIcon } from '../icon/icon';

let nextId = 0;

export interface SelectOption {
  value: string;
  label: string;
  /** Resolve `label` as an i18n key. Dynamic API-provided labels leave this false. */
  translate?: boolean;
}

/**
 * The dropdown used everywhere a field has a fixed set of choices: gender
 * and education in the patient form, the filter row above a list.
 *
 * Drawn as the app's field (label above, the same outlined box) with a
 * chevron that turns as the panel opens; the panel itself is Material's
 * select, restyled globally (styles/_overlays.scss).
 *
 * Two binding modes, because both are genuinely the same visual element: pass
 * `[control]` inside a reactive form (patient-form), or `[value]` +
 * `(valueChange)` for signal-driven UI state like a list's filter bar. Not a
 * `FormControl` for the latter: implemented as two template branches rather
 * than conditionally binding `[formControl]` to null, because
 * `FormControlDirective` is matched by the literal presence of the attribute
 * in the template and stays active once attached regardless of what its input
 * is bound to (the same reason {@link PbTextField}'s autocomplete branches).
 */
@Component({
  selector: 'pb-select-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatSelectModule, TranslatePipe, PbIcon],
  templateUrl: './select-field.html',
  styleUrl: './select-field.scss',
})
export class PbSelectField {
  private readonly i18n = inject(TranslateService);
  /** Bind inside a reactive form. Omit and use `value`/`valueChange` otherwise. */
  readonly control = input<FormControl<string> | null>(null);
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  readonly options = input.required<readonly SelectOption[]>();
  readonly label = input('');
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  /**
   * Show the hint as a line under the box rather than beside the value: for
   * information the choice works out (a return date, a follow-up day), which
   * reads as its result, not as a label.
   */
  readonly hintBelow = input(false);
  /** Leading "any/all" option for filter selects, e.g. "همه". Omit to require a real choice. */
  readonly anyLabel = input<string | null>(null);
  readonly errorMessages = input<Readonly<Record<string, string>>>({});
  /**
   * Kept so existing callers still compile. Hints now sit inside the box, so
   * the line under a field only ever holds an error, and it eases open on
   * its own height whichever value is passed.
   */
  readonly subscript = input<'fixed' | 'dynamic'>('fixed');

  protected readonly open = signal(false);
  protected readonly labelId = `pb-select-${nextId++}-label`;
  protected readonly messageId = `${this.labelId}-message`;
  /** Errors wait for the form's first submit. */
  private readonly errorsShown = errorsRevealed(() => this.control());
  private lastMessage = '';
  private lastWasError = false;

  protected showError(): boolean {
    const ctrl = this.control();
    return !!ctrl && this.errorsShown() && ctrl.invalid && this.errorText() !== null;
  }

  /** The error; or, set below the box, the hint. Otherwise the hint sits beside the value. */
  protected message(): string | null {
    if (this.showError()) return this.errorText();
    return this.hintBelow() ? this.hint() : null;
  }

  protected placeholderText(): string {
    return placeholderWithHint(this.placeholder(), this.hintBelow() ? null : this.hint());
  }

  /** What the box shows for the current choice, drawn by hand so the hint can sit beside it. */
  protected selectedLabel(): string {
    const value = this.control()?.value ?? this.value();
    const option = this.options().find((o) => o.value === value);
    if (option) return option.translate ? this.i18n.instant(option.label) : option.label;
    return value === '' ? (this.anyLabel() ?? '') : '';
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
    const ctrl = this.control();
    return ctrl ? firstErrorMessage(ctrl.errors, this.i18n, this.errorMessages()) : null;
  }

  protected onSelectionChange(event: MatSelectChange): void {
    this.valueChange.emit(event.value as string);
  }
}
