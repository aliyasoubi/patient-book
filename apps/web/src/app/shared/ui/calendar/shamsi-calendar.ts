import { MatTooltipModule } from '@angular/material/tooltip';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  addDays,
  addMonths,
  addYears,
  format,
  getDate,
  getDay,
  getMonth,
  getYear,
  isSameDay,
  isSameMonth,
  setMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns-jalali';

import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from '../../../core/jalali/jalali-date-adapter';
import { formatPersianNumber } from '../../pipes/persian-number.pipe';
import { PbIcon } from '../icon/icon';

export type CalendarView = 'days' | 'months' | 'years';
/** What a marked day carries: a dot in one of these tones. */
export type CalendarMarkTone = 'brand' | 'warn' | 'success' | 'neutral';

/** Friday, in JavaScript's numbering: the weekly holiday. */
const FRIDAY = 5;
/** Saturday, in JavaScript's numbering: where the Iranian week starts. */
const SATURDAY = 6;
const YEARS_PER_PAGE = 12;

interface DayCell {
  date: Date;
  key: string;
  day: string;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  holiday: boolean;
  disabled: boolean;
  mark: CalendarMarkTone | null;
  label: string;
}

/**
 * A Jalali (Shamsi) calendar of the app's own, in place of Material's: the
 * week starts on Saturday, Friday is the holiday, months are the Persian
 * months with their real lengths.
 *
 * Three views, one tap apart: the days of a month; the twelve months of a
 * year (tap the month); twelve years at a time (tap the year). Today is
 * ringed in the brand colour, the chosen day filled with it; a day can carry
 * a coloured dot (`marks`, keyed `yyyy/MM/dd`). Fridays read in the holiday
 * tone, days outside the month fade back, days outside `min`/`max` cannot be
 * chosen.
 *
 * Motion: a new month slides in from the side it comes from — the next one
 * from the left, in this right-to-left calendar — while the old one fades;
 * switching view zooms softly; the chosen day pops in on a spring.
 *
 * Keyboard: arrow keys move a day (left is forward), up and down a week,
 * Page Up/Down a month (with Shift, a year), Home/End to the week's ends,
 * Enter or Space chooses.
 */
@Component({
  selector: 'pb-shamsi-calendar',
  standalone: true,
  host: { '[class.is-compact]': 'compact()' },
  imports: [MatTooltipModule, PbIcon, TranslatePipe],
  templateUrl: './shamsi-calendar.html',
  styleUrl: './shamsi-calendar.scss',
})
export class PbShamsiCalendar {
  private readonly i18n = inject(TranslateService);
  private readonly injector = inject(Injector);

  readonly selected = input<Date | null>(null);
  readonly min = input<Date | null>(null);
  readonly max = input<Date | null>(null);
  readonly marks = input<ReadonlyMap<string, CalendarMarkTone> | null>(null);
  readonly startView = input<CalendarView>('days');
  /** Shorter rows, for a calendar that shares the screen with other panels. */
  readonly compact = input(false);
  /** Show the «امروز» shortcut in the header. */
  readonly showToday = input(true);
  readonly dateChange = output<Date>();

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  protected readonly view = signal<CalendarView>('days');
  /** The day the keyboard is on, and so the month shown. */
  protected readonly cursor = signal(new Date());
  /** Which way the last month change went, for the slide: 1 forward, -1 back. */
  protected readonly direction = signal<1 | -1>(1);
  /** Bumped on every month change, so the slide replays. */
  protected readonly turn = signal(0);

  constructor() {
    effect(() => {
      this.view.set(this.startView());
    });
    effect(() => {
      const selected = this.selected();
      this.cursor.set(selected ?? new Date());
    });
  }

  // ── Header ────────────────────────────────────────────────────────

  protected readonly monthName = computed(() => {
    this.i18n.currentLang();
    return this.i18n.instant(JALALI_MONTH_KEYS[getMonth(this.cursor())]);
  });

  protected readonly yearLabel = computed(() => formatPersianNumber(getYear(this.cursor())));

  protected readonly weekdays = computed(() => {
    this.i18n.currentLang();
    // Saturday first: JS days 6, 0, 1 … 5.
    return [SATURDAY, 0, 1, 2, 3, 4, FRIDAY].map((d) => ({
      short: this.i18n.instant(`dayNarrow.${JALALI_WEEKDAY_KEYS[d]}`),
      full: this.i18n.instant(`day.${JALALI_WEEKDAY_KEYS[d]}`),
      holiday: d === FRIDAY,
    }));
  });

  // ── Days ──────────────────────────────────────────────────────────

  protected readonly days = computed<DayCell[]>(() => {
    this.i18n.currentLang();
    const cursor = this.cursor();
    const first = startOfWeek(startOfMonth(cursor), { weekStartsOn: SATURDAY });
    const today = new Date();
    const selected = this.selected();
    const marks = this.marks();
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(first, i);
      const key = format(date, 'yyyy/MM/dd');
      return {
        date,
        key,
        day: formatPersianNumber(getDate(date)),
        inMonth: isSameMonth(date, cursor),
        today: isSameDay(date, today),
        selected: !!selected && isSameDay(date, selected),
        holiday: getDay(date) === FRIDAY,
        disabled: this.outOfRange(date),
        mark: marks?.get(key) ?? null,
        label: this.fullLabel(date),
      };
    });
  });

  /** Six rows, unless the month fits in five — no blank sixth week. */
  protected readonly rows = computed(() => {
    const cells = this.days();
    const weeks = [0, 1, 2, 3, 4, 5].map((w) => cells.slice(w * 7, w * 7 + 7));
    return weeks.filter((week, i) => i < 5 || week.some((c) => c.inMonth));
  });

  // ── Months and years ──────────────────────────────────────────────

  protected readonly months = computed(() => {
    this.i18n.currentLang();
    const cursor = this.cursor();
    const today = new Date();
    const selected = this.selected();
    return JALALI_MONTH_KEYS.map((key, index) => ({
      index,
      label: this.i18n.instant(key),
      current: getYear(cursor) === getYear(today) && index === getMonth(today),
      selected: !!selected && getYear(selected) === getYear(cursor) && getMonth(selected) === index,
    }));
  });

  /**
   * Twelve years ending at the one in view: the dates the practice picks a
   * year for — a birth date above all — lie behind, not ahead.
   */
  protected readonly years = computed(() => {
    const year = getYear(this.cursor());
    const start = year - YEARS_PER_PAGE + 1;
    const thisYear = getYear(new Date());
    const selected = this.selected();
    return Array.from({ length: YEARS_PER_PAGE }, (_, i) => start + i).map((y) => ({
      year: y,
      label: formatPersianNumber(y),
      current: y === thisYear,
      selected: !!selected && getYear(selected) === y,
    }));
  });

  protected readonly yearRange = computed(() => {
    const ys = this.years();
    return `${ys[0].label} – ${ys[ys.length - 1].label}`;
  });

  // ── Actions ───────────────────────────────────────────────────────

  /** Previous/next: a month on the days view, a year on months, twelve years on years. */
  protected step(delta: 1 | -1): void {
    const view = this.view();
    const cursor = this.cursor();
    this.direction.set(delta);
    this.turn.update((t) => t + 1);
    this.cursor.set(
      view === 'days'
        ? addMonths(cursor, delta)
        : view === 'months'
          ? addYears(cursor, delta)
          : addYears(cursor, delta * YEARS_PER_PAGE),
    );
  }

  /**
   * «امروز» picks today, not just its month: whatever reads the chosen day —
   * the dashboard's list under the calendar — follows. The month slides only
   * when it actually changes.
   */
  protected goToday(): void {
    const today = new Date();
    if (!isSameMonth(today, this.cursor())) {
      this.direction.set(today > this.cursor() ? 1 : -1);
      this.turn.update((t) => t + 1);
    }
    this.cursor.set(today);
    this.view.set('days');
    if (!this.outOfRange(today)) this.dateChange.emit(today);
  }

  protected openMonths(): void {
    this.view.set(this.view() === 'months' ? 'days' : 'months');
  }

  protected openYears(): void {
    this.view.set(this.view() === 'years' ? 'days' : 'years');
  }

  protected chooseMonth(index: number): void {
    this.cursor.set(setMonth(this.cursor(), index));
    this.view.set('days');
  }

  protected chooseYear(year: number): void {
    this.cursor.set(addYears(this.cursor(), year - getYear(this.cursor())));
    this.view.set('months');
  }

  protected choose(cell: DayCell): void {
    if (cell.disabled) return;
    if (!cell.inMonth) {
      this.direction.set(cell.date > this.cursor() ? 1 : -1);
      this.turn.update((t) => t + 1);
    }
    this.cursor.set(cell.date);
    this.dateChange.emit(cell.date);
  }

  /** Arrow keys walk the days — left is forward in a right-to-left calendar. */
  protected onKeydown(event: KeyboardEvent): void {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(this.cursor(), 1),
      ArrowRight: () => addDays(this.cursor(), -1),
      ArrowDown: () => addDays(this.cursor(), 7),
      ArrowUp: () => addDays(this.cursor(), -7),
      PageDown: () => (event.shiftKey ? addYears : addMonths)(this.cursor(), 1),
      PageUp: () => (event.shiftKey ? addYears : addMonths)(this.cursor(), -1),
      Home: () => startOfWeek(this.cursor(), { weekStartsOn: SATURDAY }),
      End: () => addDays(startOfWeek(this.cursor(), { weekStartsOn: SATURDAY }), 6),
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const cell = this.days().find((c) => isSameDay(c.date, this.cursor()));
      if (cell) this.choose(cell);
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move();
    if (!isSameMonth(next, this.cursor())) {
      this.direction.set(next > this.cursor() ? 1 : -1);
      this.turn.update((t) => t + 1);
    }
    this.cursor.set(next);
    this.focusCursor();
  }

  protected isCursor(cell: DayCell): boolean {
    return isSameDay(cell.date, this.cursor());
  }

  /** Put focus on the day under the cursor, once it has rendered. */
  focusCursor(): void {
    afterNextRender(
      () =>
        this.grid()
          ?.nativeElement.querySelector<HTMLElement>('[data-cursor="true"]')
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  private outOfRange(date: Date): boolean {
    const min = this.min();
    const max = this.max();
    return (!!min && date < startOfDay(min)) || (!!max && date > endOfDay(max));
  }

  private fullLabel(date: Date): string {
    const weekday = this.i18n.instant(`day.${JALALI_WEEKDAY_KEYS[getDay(date)]}`);
    const month = this.i18n.instant(JALALI_MONTH_KEYS[getMonth(date)]);
    return `${weekday} ${formatPersianNumber(getDate(date))} ${month} ${formatPersianNumber(getYear(date))}`;
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
