import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { type FormControl, type ValidationErrors } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import { getDate, getDay, getMonth, getYear } from 'date-fns-jalali';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { errorsRevealed } from '../form-submitted';
import { firstErrorMessage, hintAsNote, placeholderWithHint } from '../field-errors';
import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from '../../../core/jalali/jalali-date-adapter';
import { PbIcon } from '../icon/icon';
import { PbAutoHeight } from '../auto-height/auto-height';
import { PbShamsiCalendar, type CalendarView } from '../calendar/shamsi-calendar';

let nextId = 0;

/** Material's view names, which the forms already pass, in the calendar's terms. */
const VIEW_FOR: Record<'month' | 'year' | 'multi-year', CalendarView> = {
  month: 'days',
  year: 'months',
  'multi-year': 'years',
};

/**
 * The Jalali date input used on every date the practice records — birth
 * date, first/last visit, surgery date, the day work went to the lab.
 *
 * Drawn like every new field (styles/_field.scss): label above, the box, a
 * message below. A date can be typed — `1405/8/20`, in either kind of digit
 * — and is read when the field is left or Enter is pressed; or picked from
 * the app's own Shamsi calendar, which opens under the field (above it near
 * the bottom of the screen) from the calendar button or Alt+↓. Picking
 * closes it and puts the caret back; «امروز» and «پاک کردن» sit at its foot.
 *
 * Bound to a `FormControl<Date | null>`, as before: what cannot be read as a
 * date keeps the text on screen and fails the control with `jalaliDate`, so
 * the form says so rather than dropping it silently.
 */
@Component({
  selector: 'pb-date-field',
  standalone: true,
  imports: [PbAutoHeight, PbIcon, PbShamsiCalendar, TranslatePipe],
  templateUrl: './date-field.html',
  styleUrl: './date-field.scss',
})
export class PbDateField {
  private readonly i18n = inject(TranslateService);
  private readonly adapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly control = input.required<FormControl<Date | null>>();
  readonly label = input('');
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  /** 'multi-year' opens straight to the year grid — useful for birth dates. */
  readonly startView = input<'month' | 'year' | 'multi-year'>('month');
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly calendar = viewChild(PbShamsiCalendar);

  protected readonly id = `pb-date-${nextId++}`;
  protected readonly messageId = `${this.id}-message`;
  /** Errors wait for the form's first submit. */
  private readonly errorsShown = errorsRevealed(() => this.control());
  protected readonly open = signal(false);
  protected readonly above = signal(false);
  /** What the box shows: the formatted value, or what is being typed. */
  protected readonly text = signal('');
  /** The typed text could not be read as a date. */
  private readonly unreadable = signal(false);
  /** The caret is in the box: it shows the date as digits, ready to edit. */
  protected readonly focused = signal(false);
  /** Bumped when the control's value or state changes, to re-read it in the template. */
  private readonly tick = signal(0);

  /**
   * At rest a picked date reads as words — «پنجشنبه ۲۱ آبان ۱۴۰۵» — with its
   * weekday, so nobody has to work out what ۱۴۰۵/۰۸/۲۱ is; in the caret it
   * turns back into digits to edit. Text that is not a date stays as typed.
   */
  protected readonly pretty = computed(() => {
    this.i18n.currentLang();
    const value = this.value();
    if (this.focused() || this.unreadable() || !value || !this.adapter.isValid(value)) return null;
    const weekday = this.i18n.instant(`day.${JALALI_WEEKDAY_KEYS[getDay(value)]}`);
    const month = this.i18n.instant(JALALI_MONTH_KEYS[getMonth(value)]);
    return `${weekday} ${getDate(value)} ${month} ${getYear(value)}`;
  });

  protected readonly calendarView = computed(() => VIEW_FOR[this.startView()]);
  protected readonly value = computed(() => {
    this.tick();
    return this.control().value;
  });

  private lastMessage = '';
  private lastWasError = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Follow the control: a value set by the form shows formatted, and state
    // changes (touched on submit, a reset) re-render the message.
    effect((onCleanup) => {
      const control = this.control();
      const unreadable = (): ValidationErrors | null =>
        this.unreadable() ? { jalaliDate: true } : null;
      control.addValidators(unreadable);
      control.updateValueAndValidity({ emitEvent: false });
      this.text.set(this.display(control.value));
      const sub = control.events.subscribe(() => {
        this.tick.update((t) => t + 1);
        if (!this.unreadable() && document.activeElement !== this.field()?.nativeElement) {
          this.text.set(this.display(control.value));
        }
      });
      onCleanup(() => {
        sub.unsubscribe();
        control.removeValidators(unreadable);
      });
    });
    destroyRef.onDestroy(() => this.open.set(false));
  }

  // ── Errors ──────────────────────────────────────────────────────────

  protected showError(): boolean {
    this.tick();
    const control = this.control();
    return control.invalid && this.errorsShown() && this.errorText() !== null;
  }

  /** The hint, after the example date, as the placeholder while empty. */
  protected withHint(placeholder: string): string {
    return placeholderWithHint(placeholder, this.hint());
  }

  protected showInlineHint(): boolean {
    // The example date is always the placeholder, so the hint is always a note.
    return hintAsNote('date', this.hint(), this.control().value);
  }

  protected message(): string | null {
    return this.showError() ? this.errorText() : null;
  }

  protected messageText(): string {
    const current = this.message();
    if (current) this.lastMessage = current;
    return this.lastMessage;
  }

  protected messageIsError(): boolean {
    if (this.message()) this.lastWasError = this.showError();
    return this.lastWasError;
  }

  private errorText(): string | null {
    return firstErrorMessage(this.control().errors, this.i18n, this.errorMessages());
  }

  // ── Typing ──────────────────────────────────────────────────────────

  /** Read as it is typed, so a form submitted without leaving the field has the date. */
  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    this.commitText(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitText();
    } else if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      this.openCalendar();
    } else if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
    }
  }

  protected onFocus(): void {
    this.focused.set(true);
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.commitText();
    this.control().markAsTouched();
    this.tick.update((t) => t + 1);
  }

  /**
   * Read what was typed: empty clears, a date sets, anything else is kept
   * and flagged. `tidy` rewrites the text in the canonical form — on leaving
   * the field, not mid-typing, where it would fight the caret.
   */
  private commitText(tidy = true): void {
    const raw = this.text().trim();
    const control = this.control();
    if (!raw) {
      this.unreadable.set(false);
      if (control.value !== null) control.setValue(null);
      else control.updateValueAndValidity();
      return;
    }
    const parsed = this.adapter.parse(raw, 'yyyy/MM/dd');
    if (parsed && this.adapter.isValid(parsed)) {
      this.unreadable.set(false);
      control.setValue(parsed);
      if (tidy) this.text.set(this.display(parsed));
    } else {
      this.unreadable.set(true);
      control.updateValueAndValidity();
    }
    control.markAsDirty();
  }

  // ── The calendar ────────────────────────────────────────────────────

  protected toggle(): void {
    if (this.open()) this.close();
    else this.openCalendar();
  }

  private openCalendar(): void {
    // Near the bottom of the screen, open upward rather than off its edge.
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.above.set(innerHeight - rect.bottom < 420 && rect.top > 420);
    this.open.set(true);
    afterNextRender(() => this.calendar()?.focusCursor(), { injector: this.injector });
  }

  protected close(): void {
    this.open.set(false);
  }

  protected pick(date: Date): void {
    this.unreadable.set(false);
    this.control().setValue(date);
    this.control().markAsDirty();
    this.control().markAsTouched();
    this.text.set(this.display(date));
    this.close();
    this.field()?.nativeElement.focus({ preventScroll: true });
  }

  protected pickToday(): void {
    this.pick(new Date());
  }

  protected clear(): void {
    this.unreadable.set(false);
    this.control().setValue(null);
    this.control().markAsDirty();
    this.text.set('');
    this.close();
  }

  /** Escape inside the calendar closes it and hands the caret back. */
  @HostListener('keydown.escape')
  protected onEscape(): void {
    if (!this.open()) return;
    this.close();
    this.field()?.nativeElement.focus({ preventScroll: true });
  }

  /** A press anywhere outside the field and its calendar closes it. */
  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointer(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private display(value: Date | null): string {
    return value && this.adapter.isValid(value) ? this.adapter.format(value, 'yyyy/MM/dd') : '';
  }
}
