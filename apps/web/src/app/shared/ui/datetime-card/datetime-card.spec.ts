import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PbDatetimeCard } from './datetime-card';

describe('PbDatetimeCard', () => {
  beforeEach(() => {
    // 10 Mehr 1405, a Friday. Mehr has 30 days and starts on a Wednesday.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 9, 5));
  });

  afterEach(() => vi.useRealTimers());

  function render() {
    TestBed.configureTestingModule({
      imports: [PbDatetimeCard],
      providers: [provideTranslateService()],
    });
    const fixture = TestBed.createComponent(PbDatetimeCard);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lays out this month Saturday-first with today marked', () => {
    const { el } = render();
    expect(el.querySelectorAll('.pb-today__day').length).toBe(30);
    expect(el.querySelector('.pb-today__day--today')?.textContent?.trim()).toBe('۱۰');
    expect(el.querySelector('.pb-today__time')?.textContent?.trim()).toBe('۰۹:۰۵');
  });

  it('pages to other months and back to today', () => {
    const { el, fixture } = render();
    const [previous, next] = el.querySelectorAll<HTMLElement>('pb-icon-button');

    previous.click(); // Shahrivar: 31 days, no today.
    fixture.detectChanges();
    expect(el.querySelectorAll('.pb-today__day').length).toBe(31);
    expect(el.querySelector('.pb-today__day--today')).toBeNull();

    next.click();
    next.click(); // Aban: 30 days.
    fixture.detectChanges();
    expect(el.querySelector('.pb-today__day--today')).toBeNull();

    el.querySelector<HTMLButtonElement>('.pb-today__back')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.pb-today__day--today')?.textContent?.trim()).toBe('۱۰');
    expect(el.querySelector('.pb-today__back')).toBeNull();
  });
});
