import { effect, inject, Injectable } from '@angular/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateService } from '@ngx-translate/core';

/** Persian labels for text that Angular Material otherwise renders in English. */
@Injectable()
export class PersianPaginatorIntl extends MatPaginatorIntl {
  private readonly i18n = inject(TranslateService);

  constructor() {
    super();
    effect(() => {
      this.i18n.currentLang();
      this.itemsPerPageLabel = this.i18n.instant('paginator.itemsPerPage');
      this.nextPageLabel = this.i18n.instant('paginator.nextPage');
      this.previousPageLabel = this.i18n.instant('paginator.previousPage');
      this.firstPageLabel = this.i18n.instant('paginator.firstPage');
      this.lastPageLabel = this.i18n.instant('paginator.lastPage');
      this.changes.next();
    });
  }

  private format(value: number): string {
    return new Intl.NumberFormat(this.i18n.currentLang() ?? 'fa').format(value);
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    const safeLength = Math.max(length, 0);
    const total = this.format(safeLength);
    if (safeLength === 0 || pageSize === 0) {
      const zero = this.format(0);
      return this.i18n.instant('paginator.emptyRange', { start: zero, total });
    }

    const start = this.format(page * pageSize + 1);
    const end = this.format(Math.min((page + 1) * pageSize, safeLength));
    return this.i18n.instant('paginator.range', { start, end, total });
  };
}

/** Persian screen-reader and tooltip labels for the Material datepicker. */
@Injectable()
export class PersianDatepickerIntl extends MatDatepickerIntl {
  private readonly i18n = inject(TranslateService);

  constructor() {
    super();
    effect(() => {
      this.i18n.currentLang();
      this.calendarLabel = this.i18n.instant('datepicker.calendar');
      this.openCalendarLabel = this.i18n.instant('datepicker.open');
      this.closeCalendarLabel = this.i18n.instant('datepicker.close');
      this.prevMonthLabel = this.i18n.instant('datepicker.previousMonth');
      this.nextMonthLabel = this.i18n.instant('datepicker.nextMonth');
      this.prevYearLabel = this.i18n.instant('datepicker.previousYear');
      this.nextYearLabel = this.i18n.instant('datepicker.nextYear');
      this.prevMultiYearLabel = this.i18n.instant('datepicker.previousYears');
      this.nextMultiYearLabel = this.i18n.instant('datepicker.nextYears');
      this.switchToMonthViewLabel = this.i18n.instant('datepicker.switchToMonth');
      this.switchToMultiYearViewLabel = this.i18n.instant('datepicker.switchToYear');
      this.startDateLabel = this.i18n.instant('datepicker.startDate');
      this.endDateLabel = this.i18n.instant('datepicker.endDate');
      this.comparisonDateLabel = this.i18n.instant('datepicker.comparisonDate');
      this.changes.next();
    });
  }

  override formatYearRange(start: string, end: string): string {
    return this.i18n.instant('datepicker.yearRange', { start, end });
  }

  override formatYearRangeLabel(start: string, end: string): string {
    return this.i18n.instant('datepicker.yearRangeLabel', { start, end });
  }
}
