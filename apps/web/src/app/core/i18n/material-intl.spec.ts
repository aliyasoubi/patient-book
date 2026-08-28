import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { PersianDatepickerIntl, PersianPaginatorIntl } from './material-intl';

const messages: Record<string, string> = {
  'paginator.itemsPerPage': 'تعداد در هر صفحه:',
  'paginator.nextPage': 'صفحه بعد',
  'paginator.previousPage': 'صفحه قبل',
  'paginator.firstPage': 'صفحه اول',
  'paginator.lastPage': 'صفحه آخر',
  'paginator.range': '{{start}}–{{end}} از {{total}}',
  'datepicker.calendar': 'تقویم',
  'datepicker.open': 'باز کردن تقویم',
  'datepicker.close': 'بستن تقویم',
  'datepicker.previousMonth': 'ماه قبل',
  'datepicker.nextMonth': 'ماه بعد',
  'datepicker.previousYear': 'سال قبل',
  'datepicker.nextYear': 'سال بعد',
  'datepicker.previousYears': 'سال‌های قبل',
  'datepicker.nextYears': 'سال‌های بعد',
  'datepicker.switchToMonth': 'انتخاب ماه',
  'datepicker.switchToYear': 'انتخاب سال',
};

const translateStub = {
  currentLang: signal<string | null>('fa'),
  instant(key: string, params: Record<string, unknown> = {}): string {
    return (messages[key] ?? key).replace(/{{(\w+)}}/g, (_, name: string) => String(params[name]));
  },
};

describe('Persian Angular Material labels', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: TranslateService, useValue: translateStub }],
    });
  });

  it('replaces every paginator label and formats the range in Persian', () => {
    const intl = TestBed.runInInjectionContext(() => new PersianPaginatorIntl());
    TestBed.flushEffects();

    expect([
      intl.itemsPerPageLabel,
      intl.nextPageLabel,
      intl.previousPageLabel,
      intl.firstPageLabel,
      intl.lastPageLabel,
    ]).not.toEqual(expect.arrayContaining([expect.stringMatching(/[A-Za-z]/)]));
    expect(intl.getRangeLabel(1, 25, 100)).toBe('۲۶–۵۰ از ۱۰۰');
  });

  it('replaces the datepicker English defaults', () => {
    const intl = TestBed.runInInjectionContext(() => new PersianDatepickerIntl());
    TestBed.flushEffects();

    expect([
      intl.calendarLabel,
      intl.openCalendarLabel,
      intl.closeCalendarLabel,
      intl.prevMonthLabel,
      intl.nextMonthLabel,
      intl.prevYearLabel,
      intl.nextYearLabel,
      intl.prevMultiYearLabel,
      intl.nextMultiYearLabel,
      intl.switchToMonthViewLabel,
      intl.switchToMultiYearViewLabel,
    ]).not.toEqual(expect.arrayContaining([expect.stringMatching(/[A-Za-z]/)]));
  });
});
