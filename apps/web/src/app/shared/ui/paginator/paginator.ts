import { Component, computed, input, output } from '@angular/core';
import type { PageEvent } from '@angular/material/paginator';
import { TranslatePipe } from '@ngx-translate/core';

import { PersianNumberPipe, formatPersianCount } from '../../pipes/persian-number.pipe';
import { PbIcon } from '../icon/icon';

/** The page sizes every register offers. */
const PAGE_SIZES = [10, 25, 50, 100];

/** A page number to show, or a gap standing for the run of pages left out. */
type Slot = { kind: 'page'; n: number } | { kind: 'gap'; key: string };

/**
 * The pager under every register — patients, the follow-ups, the implant and
 * ortho books, the lab archive. Laid out like the pagers of the tools people
 * know: on the start side where you are («۲۶–۵۰ از ۳۲۰»); in the middle the
 * pages themselves, the first and last always there, the ones around the
 * current page, and «…» for the rest; on the end side how many rows a page
 * holds, as a small switch rather than a dropdown. The current page is the
 * one dark pill; moving to another fills it in place.
 *
 * `page` is 1-based, as the API and every list's own state count it. It
 * emits Material's `PageEvent` (0-based `pageIndex`), which the lists
 * already handle.
 */
@Component({
  selector: 'pb-paginator',
  standalone: true,
  imports: [PersianNumberPipe, TranslatePipe, PbIcon],
  template: `
    <nav class="pager" [attr.aria-label]="'common.pagination' | translate">
      <p class="pager__range" aria-live="polite">
        @if (length()) {
          {{ 'pager.range' | translate: rangeParams() }}
        } @else {
          {{ 'pager.none' | translate }}
        }
      </p>

      @if (pageCount() > 1) {
        <div class="pager__pages">
          <button
            type="button"
            class="pager__step"
            [disabled]="page() <= 1"
            (click)="go(page() - 1)"
            [attr.aria-label]="'pager.prev' | translate"
          >
            <pb-icon name="chevron-right" [size]="18" />
            <span class="pager__step-label">{{ 'pager.prev' | translate }}</span>
          </button>

          @for (slot of slots(); track slot.kind === 'page' ? slot.n : slot.key) {
            @if (slot.kind === 'page') {
              <button
                type="button"
                class="pager__page"
                [class.is-current]="slot.n === page()"
                [attr.aria-current]="slot.n === page() ? 'page' : null"
                [attr.aria-label]="'pager.page' | translate: { n: (slot.n | faNum) }"
                (click)="go(slot.n)"
              >
                {{ slot.n | faNum }}
              </button>
            } @else {
              <span class="pager__gap" aria-hidden="true">…</span>
            }
          }

          <button
            type="button"
            class="pager__step"
            [disabled]="page() >= pageCount()"
            (click)="go(page() + 1)"
            [attr.aria-label]="'pager.next' | translate"
          >
            <span class="pager__step-label">{{ 'pager.next' | translate }}</span>
            <pb-icon name="chevron-left" [size]="18" />
          </button>
        </div>
      }

      <div class="pager__size" role="radiogroup" [attr.aria-label]="'pager.perPage' | translate">
        <span class="pager__size-label">{{ 'pager.perPage' | translate }}</span>
        <span class="pager__sizes">
          @for (size of pageSizes; track size) {
            <button
              type="button"
              role="radio"
              class="pager__size-option"
              [class.is-on]="size === pageSize()"
              [attr.aria-checked]="size === pageSize()"
              (click)="setSize(size)"
            >
              {{ size | faNum }}
            </button>
          }
        </span>
      </div>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      padding-block-start: var(--pb-space-4);
      border-block-start: 1px solid var(--pb-neutral-200);
    }

    .pager {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--pb-space-3) var(--pb-space-4);
    }

    .pager__range {
      margin: 0;
      color: var(--pb-neutral-500);
      font-size: 0.8125rem;
      font-weight: 600;
      font-feature-settings: var(--pb-font-numeric);
    }

    .pager__pages {
      display: flex;
      align-items: center;
      gap: var(--pb-space-1);
    }

    .pager__page,
    .pager__step {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--pb-space-1);
      min-inline-size: 36px;
      block-size: 36px;
      padding-inline: var(--pb-space-2);
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--pb-neutral-600);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 700;
      font-feature-settings: var(--pb-font-numeric);
      cursor: pointer;
      transition:
        background-color 200ms var(--pb-ease-standard),
        color 200ms var(--pb-ease-standard),
        scale 150ms var(--pb-ease-standard);

      &:hover:not(:disabled):not(.is-current) {
        background: var(--pb-neutral-100);
        color: var(--pb-graphite);
      }

      &:active:not(:disabled) {
        scale: 0.94;
      }

      &:focus-visible {
        outline: 2px solid var(--pb-brand);
        outline-offset: 2px;
      }

      &:disabled {
        color: var(--pb-neutral-300);
        cursor: default;
      }
    }

    .pager__step {
      padding-inline: var(--pb-space-2) var(--pb-space-3);

      &:last-child {
        padding-inline: var(--pb-space-3) var(--pb-space-2);
      }
    }

    .pager__page.is-current {
      background: var(--pb-graphite);
      color: var(--pb-on-graphite);
      animation: pager-pop 280ms var(--pb-ease-spring);
    }

    @keyframes pager-pop {
      from {
        scale: 0.8;
      }
    }

    .pager__gap {
      display: inline-grid;
      place-items: center;
      min-inline-size: 24px;
      color: var(--pb-neutral-400);
    }

    .pager__size {
      display: flex;
      align-items: center;
      gap: var(--pb-space-2);
    }

    .pager__size-label {
      color: var(--pb-neutral-500);
      font-size: 0.8125rem;
    }

    .pager__sizes {
      display: inline-flex;
      padding: 3px;
      border-radius: 11px;
      background: color-mix(in srgb, var(--pb-neutral-300) 45%, transparent);
    }

    .pager__size-option {
      min-inline-size: 36px;
      block-size: 30px;
      padding-inline: var(--pb-space-2);
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--pb-neutral-600);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 700;
      font-feature-settings: var(--pb-font-numeric);
      cursor: pointer;
      transition:
        background-color 200ms var(--pb-ease-standard),
        box-shadow 200ms var(--pb-ease-standard),
        color 200ms var(--pb-ease-standard);

      &:hover:not(.is-on) {
        color: var(--pb-graphite);
      }

      &.is-on {
        background: var(--pb-surface);
        box-shadow: var(--pb-shadow-sm);
        color: var(--pb-graphite);
      }

      &:focus-visible {
        outline: 2px solid var(--pb-brand);
        outline-offset: 1px;
      }
    }

    /* A phone: the words on prev and next go; the arrows stay. */
    @media (max-width: 640px) {
      .pager__step-label,
      .pager__size-label {
        display: none;
      }

      .pager {
        justify-content: center;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pager__page.is-current {
        animation: none;
      }
    }
  `,
})
export class PbPaginator {
  readonly length = input.required<number>();
  /** 1-based. */
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageChange = output<PageEvent>();

  protected readonly pageSizes = PAGE_SIZES;

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.length() / this.pageSize())),
  );

  protected readonly rangeParams = computed(() => {
    const from = (this.page() - 1) * this.pageSize() + 1;
    const to = Math.min(this.length(), this.page() * this.pageSize());
    return {
      from: formatPersianCount(from),
      to: formatPersianCount(to),
      total: formatPersianCount(this.length()),
    };
  });

  /**
   * The first and last page, the current one and its neighbours; a single
   * page left out is shown rather than hidden behind «…», so a gap always
   * stands for two or more.
   */
  protected readonly slots = computed<Slot[]>(() => {
    const count = this.pageCount();
    const current = Math.min(this.page(), count);
    const wanted = new Set([1, count, current - 1, current, current + 1]);
    if (current <= 3) [2, 3, 4].forEach((n) => wanted.add(n));
    if (current >= count - 2) [count - 1, count - 2, count - 3].forEach((n) => wanted.add(n));
    const pages = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
    const slots: Slot[] = [];
    pages.forEach((n, i) => {
      const prev = pages[i - 1];
      if (prev !== undefined && n - prev === 2) slots.push({ kind: 'page', n: n - 1 });
      else if (prev !== undefined && n - prev > 2) slots.push({ kind: 'gap', key: `gap-${n}` });
      slots.push({ kind: 'page', n });
    });
    return slots;
  });

  protected go(n: number): void {
    const target = Math.min(Math.max(1, n), this.pageCount());
    if (target === this.page()) return;
    this.pageChange.emit({
      pageIndex: target - 1,
      previousPageIndex: this.page() - 1,
      pageSize: this.pageSize(),
      length: this.length(),
    });
  }

  /** A new page size starts again from the first page. */
  protected setSize(size: number): void {
    if (size === this.pageSize()) return;
    this.pageChange.emit({
      pageIndex: 0,
      previousPageIndex: this.page() - 1,
      pageSize: size,
      length: this.length(),
    });
  }
}
