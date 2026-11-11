import { Component, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { JALALI_MONTH_KEYS } from '../../core/jalali/jalali-date-adapter';
import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';

/** Twelve months of new patients, laid out as SVG paths on a 100 × 32 box. */
export interface Trend {
  line: string;
  area: string;
  months: { month: string; count: number }[];
  max: number;
  last: { month: string; count: number };
}

/**
 * New patients over the last twelve months: this month's figure, the line
 * drawn in from the oldest month, and the months named under it.
 */
@Component({
  selector: 'pb-stats-trend',
  standalone: true,
  imports: [PersianCountPipe, TranslatePipe],
  templateUrl: './stats-trend.html',
  styleUrl: './stats-trend.scss',
})
export class StatsTrend {
  private readonly i18n = inject(TranslateService);
  readonly trend = input.required<Trend>();

  /** A month's name under the chart, from its `yyyy/MM` key. */
  protected monthShort(month: string): string {
    return JALALI_MONTH_KEYS[Number(month.slice(5, 7)) - 1] ?? '';
  }

  /** Screen-reader description of the line. */
  protected ariaLabel(): string {
    return this.i18n.instant('stats.trendAria', { max: this.trend().max });
  }
}
