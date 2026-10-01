import { Component, input, output } from '@angular/core';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { TranslatePipe } from '@ngx-translate/core';

/** The page sizes every register offers. */
const PAGE_SIZES = [10, 25, 50, 100];

/**
 * The pager under every register — patients, the surgery queue, the implant
 * and ortho books. One place for the page sizes, the accessible name and the
 * divider that separates it from the rows above. Labels come from the
 * app-wide `MatPaginatorIntl` in `core/i18n/material-intl.ts`.
 *
 * `page` is 1-based, as the API and every list's own state count it;
 * Material's 0-based index stays inside.
 */
@Component({
  selector: 'pb-paginator',
  standalone: true,
  imports: [MatPaginatorModule, TranslatePipe],
  template: `
    <mat-paginator
      [length]="length()"
      [pageIndex]="page() - 1"
      [pageSize]="pageSize()"
      [pageSizeOptions]="pageSizes"
      (page)="pageChange.emit($event)"
      [attr.aria-label]="'common.pagination' | translate"
    />
  `,
  styles: `
    :host {
      display: block;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    mat-paginator {
      background: transparent;
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
}
