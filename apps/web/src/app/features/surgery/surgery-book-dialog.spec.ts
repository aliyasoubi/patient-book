import { TestBed } from '@angular/core/testing';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';

import type { SurgeryQueueItem } from '../../core/models/common.model';
import { JALALI_DATE_FORMATS, JalaliDateAdapter } from '../../core/jalali/jalali-date-adapter';
import { SurgeryBookDialog } from './surgery-book-dialog';

function open(followUpAppointmentAt: string | null = null) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [SurgeryBookDialog],
    providers: [
      provideTranslateService(),
      { provide: MAT_DATE_LOCALE, useValue: 'fa-IR' },
      { provide: DateAdapter, useClass: JalaliDateAdapter },
      { provide: MAT_DATE_FORMATS, useValue: JALALI_DATE_FORMATS },
      { provide: MatDialogRef, useValue: { close } },
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          item: { recordedName: 'بیمار آزمایشی', followUpAppointmentAt } as SurgeryQueueItem,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SurgeryBookDialog);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  const type = (text: string) => {
    const input = root.querySelector('input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  // The calendar toggle is a button too; confirm is the last one.
  const confirm = () => {
    const buttons = root.querySelectorAll('button');
    buttons[buttons.length - 1].click();
    fixture.detectChanges();
  };
  return { type, confirm, close };
}

describe('SurgeryBookDialog', () => {
  it('books with no day when the field is left empty', () => {
    const { confirm, close } = open();
    confirm();
    expect(close).toHaveBeenCalledWith({ date: null });
  });

  it('books the day typed', () => {
    const { type, confirm, close } = open();
    type('1405/08/01');
    confirm();
    expect(close).toHaveBeenCalledWith({ date: '1405/08/01' });
  });

  it('stays open on text that is not a date', () => {
    const { type, confirm, close } = open();
    type('1405/13/40');
    confirm();
    expect(close).not.toHaveBeenCalled();
  });

  it('does not wipe a booked day for a typo', () => {
    const { type, confirm, close } = open('1405/08/01');
    type('1405/0801');
    confirm();
    expect(close).not.toHaveBeenCalled();
  });
});
