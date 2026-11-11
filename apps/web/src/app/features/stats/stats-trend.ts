import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { JALALI_MONTH_KEYS } from '../../core/jalali/jalali-date-adapter';
import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';

/** Twelve months of new patients. `line`/`area` are the 100 × 32 sketch the page keeps for itself. */
export interface Trend {
  line: string;
  area: string;
  months: { month: string; count: number }[];
  max: number;
  last: { month: string; count: number };
}

interface Point {
  x: number;
  y: number;
  month: string;
  count: number;
}

const HEIGHT = 220;
const PAD_TOP = 20;
const PAD_BOTTOM = 32;
const PAD_SIDE = 12;

/**
 * New patients over the last twelve months as a real chart, drawn to the
 * pixel at whatever width it is given: three quiet guide lines with their
 * values, a smooth line that draws itself in from the oldest month, a soft
 * fill under it, and a point per month. Hovering a month raises a guide and
 * a small card with its name and count; this month's point breathes.
 *
 * The page reads right to left, so the oldest month is on the right.
 */
@Component({
  selector: 'pb-stats-trend',
  standalone: true,
  imports: [PersianCountPipe, PersianNumberPipe, TranslatePipe],
  templateUrl: './stats-trend.html',
  styleUrl: './stats-trend.scss',
  host: { '(pointerleave)': 'active.set(null)' },
})
export class StatsTrend {
  private readonly i18n = inject(TranslateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly trend = input.required<Trend>();

  protected readonly height = HEIGHT;
  protected readonly width = signal(0);
  /** The month under the pointer, by index. */
  protected readonly active = signal<number | null>(null);

  /** A round ceiling for the scale, so the guide values read cleanly. */
  protected readonly ceiling = computed(() => {
    const max = Math.max(1, this.trend().max);
    const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 40 ? 5 : 10;
    return Math.ceil(max / step) * step;
  });

  protected readonly guides = computed(() => {
    const top = this.ceiling();
    return [0, top / 2, top].map((value) => ({ value, y: this.yFor(value) }));
  });

  protected readonly points = computed<Point[]>(() => {
    const months = this.trend().months;
    const width = this.width();
    if (!width) return [];
    const step = (width - PAD_SIDE * 2) / months.length;
    // Oldest on the right: the first month sits at the right edge.
    return months.map((m, i) => ({
      x: width - PAD_SIDE - (i + 0.5) * step,
      y: this.yFor(m.count),
      month: m.month,
      count: m.count,
    }));
  });

  protected readonly line = computed(() => smooth(this.points(), HEIGHT - PAD_BOTTOM, PAD_TOP));

  protected readonly area = computed(() => {
    const points = this.points();
    if (!points.length) return '';
    const base = HEIGHT - PAD_BOTTOM;
    const first = points[0];
    const last = points[points.length - 1];
    return `${this.line()} L${last.x.toFixed(1)},${base} L${first.x.toFixed(1)},${base} Z`;
  });

  protected readonly activePoint = computed(() => {
    const index = this.active();
    return index === null ? null : (this.points()[index] ?? null);
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.width.set(element.clientWidth);
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(([entry]) =>
        this.width.set(Math.round(entry.contentRect.width)),
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** The nearest month to the pointer. */
  protected track(event: PointerEvent): void {
    const points = this.points();
    if (!points.length) return;
    const svg = event.currentTarget as SVGElement;
    const x = event.clientX - svg.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i;
    }
    this.active.set(best);
  }

  /** A month's name, from its `yyyy/MM` key. */
  protected monthKey(month: string): string {
    return JALALI_MONTH_KEYS[Number(month.slice(5, 7)) - 1] ?? '';
  }

  protected ariaLabel(): string {
    return this.i18n.instant('stats.trendAria', { max: this.trend().max });
  }

  private yFor(value: number): number {
    const span = HEIGHT - PAD_TOP - PAD_BOTTOM;
    return HEIGHT - PAD_BOTTOM - (value / this.ceiling()) * span;
  }
}

/**
 * A smooth line through the points (Catmull-Rom as cubic Béziers), its
 * handles held inside the plot so a dip to zero never swings below the base.
 */
function smooth(points: Point[], base: number, top: number): string {
  if (!points.length) return '';
  const clamp = (y: number) => Math.min(base, Math.max(top, y));
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
