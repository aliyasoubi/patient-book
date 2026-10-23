import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import { JALALI_MONTH_KEYS } from '../../core/jalali/jalali-date-adapter';
import type {
  ConsumptionMonth,
  InventoryCategory,
  ItemConsumption,
  MaterialConsumption,
} from '../../core/models/common.model';
import { RegistryService } from '../../core/services/registry.service';
import { LoadError } from '../../shared/components/load-error';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_ICONS,
  inventoryCategoryLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import {
  PersianNumberPipe,
  formatPersianCount,
  formatPersianNumber,
} from '../../shared/pipes/persian-number.pipe';
import {
  PbFilterChips,
  PbListToolbar,
  PbSearchField,
  PbSelectField,
  PbSurface,
} from '../../shared/ui';
import type { FilterChipOption, SelectOption } from '../../shared/ui';

type Period = 6 | 12;

interface MonthColumn {
  month: string;
  name: string;
  year: string;
  /** «from the 20th» for the month recording began in, «so far» for this one. */
  note: string | null;
}

interface ItemRow {
  id: string;
  name: string;
  /** Brand and size, as the stock list shows them. */
  detail: string | null;
  unit: string;
  archived: boolean;
  /** One per month; null where the month was not on record yet. */
  cells: (number | null)[];
  average: string | null;
}

interface CategoryGroup {
  category: InventoryCategory;
  label: string;
  icon: string;
  rows: ItemRow[];
}

/**
 * How much of each material the clinic uses a month: one row per item, one
 * column per Jalali month, in the item's own unit — a cartridge and a box of
 * gloves are never added together — and the monthly average to order by.
 *
 * "Used" is what left the shelf through a use on the stock card. A month
 * before the first stock line reads «—», unknown rather than none; the average
 * counts complete months only, so a running month cannot pull it down.
 */
@Component({
  selector: 'pb-material-consumption',
  standalone: true,
  imports: [
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
    PersianNumberPipe,
    LoadError,
    PbFilterChips,
    PbListToolbar,
    PbSearchField,
    PbSelectField,
    PbSurface,
  ],
  templateUrl: './material-consumption.html',
  styleUrl: './material-consumption.scss',
})
export class MaterialConsumptionReport {
  private readonly stats = inject(RegistryService);
  private readonly i18n = inject(TranslateService);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly period = signal<Period>(6);
  protected readonly category = signal<InventoryCategory | null>(null);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly report = signal<MaterialConsumption | null>(null);
  /** Bumped by the retry button, to load the same view again. */
  private readonly retries = signal(0);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly periodOptions: SelectOption[] = [
    { value: '6', label: 'consumption.sixMonths', translate: true },
    { value: '12', label: 'consumption.twelveMonths', translate: true },
  ];

  protected readonly columns = computed<MonthColumn[]>(() => {
    this.i18n.currentLang();
    return (this.report()?.months ?? []).map((m) => this.column(m));
  });

  /**
   * The shelves that used anything, in the store's order, for the chips —
   * and the one filtered on, even when a search or a period leaves it empty,
   * so it can still be seen and cleared.
   */
  protected readonly categoryOptions = computed<FilterChipOption[]>(() => {
    const used = new Set((this.report()?.items ?? []).map((i) => i.category));
    const only = this.category();
    if (only) used.add(only);
    return INVENTORY_CATEGORIES.filter((c) => used.has(c)).map((c) => ({
      value: c,
      label: inventoryCategoryLabel(c),
      icon: INVENTORY_CATEGORY_ICONS[c],
      translate: true,
    }));
  });

  /** Rows by shelf, in the store's order; most used first within each. */
  protected readonly groups = computed<CategoryGroup[]>(() => {
    this.i18n.currentLang();
    const report = this.report();
    if (!report) return [];
    const only = this.category();
    return INVENTORY_CATEGORIES.filter((c) => !only || c === only)
      .map((category) => ({
        category,
        label: inventoryCategoryLabel(category),
        icon: INVENTORY_CATEGORY_ICONS[category],
        rows: report.items
          .filter((i) => i.category === category)
          .map((i) => this.row(i, report.months)),
      }))
      .filter((group) => group.rows.length);
  });

  /** A month before recording began is in the window: say where the figures start. */
  protected readonly trackedNote = computed(() => {
    const report = this.report();
    if (!report?.trackedFrom || report.months.every((m) => m.tracked)) return null;
    return report.trackedFrom;
  });

  constructor() {
    // Typing waits for a pause; the first load does not.
    const query = this.search.valueChanges.pipe(
      debounceTime(250),
      map((q) => q.trim()),
      startWith(''),
      distinctUntilChanged(),
    );
    combineLatest([toObservable(this.period), query, toObservable(this.retries)])
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(([months, q]) =>
          this.stats.materialConsumption(months, q).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((report) => {
        if (report) this.report.set(report);
        this.loading.set(false);
      });

    // Where the table is wider than the screen, it opens on the latest months
    // and the average — the end of the row — not on the oldest. The end is
    // the left in a right-to-left page, which browsers count as negative.
    afterRenderEffect(() => {
      this.groups();
      const el = this.scroller()?.nativeElement;
      if (!el) return;
      const rtl = getComputedStyle(el).direction === 'rtl';
      el.scrollLeft = rtl ? -el.scrollWidth : el.scrollWidth;
    });
  }

  protected setPeriod(value: string): void {
    this.period.set(value === '12' ? 12 : 6);
  }

  protected setCategory(values: string[]): void {
    this.category.set((values[0] as InventoryCategory | undefined) ?? null);
  }

  protected retry(): void {
    this.retries.update((n) => n + 1);
  }

  private column(m: ConsumptionMonth): MonthColumn {
    const [year, month] = m.month.split('/').map(Number);
    const note =
      m.trackedFromDay !== null
        ? this.i18n.instant('consumption.fromDay', {
            day: formatPersianCount(m.trackedFromDay),
          })
        : m.current
          ? this.i18n.instant('consumption.soFar')
          : null;
    return {
      month: m.month,
      name: this.i18n.instant(JALALI_MONTH_KEYS[month - 1]),
      year: formatPersianNumber(year),
      note,
    };
  }

  private row(item: ItemConsumption, months: readonly ConsumptionMonth[]): ItemRow {
    return {
      id: item.id,
      name: item.name,
      detail: [item.brand, item.spec].filter(Boolean).join(' · ') || null,
      unit: this.i18n.instant(inventoryUnitLabel(item.unit)),
      archived: item.archived,
      cells: item.used.map((n, i) => (months[i]?.tracked ? n : null)),
      average: item.monthlyAverage === null ? null : formatAverage(item.monthlyAverage),
    };
  }
}

const AVERAGE_FORMAT = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

/** Persian digits and decimal mark, one decimal at most: 12.5 reads as the clinic writes it. */
export function formatAverage(value: number): string {
  return AVERAGE_FORMAT.format(value);
}
