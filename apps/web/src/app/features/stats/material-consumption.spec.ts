import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemConsumption, MaterialConsumption } from '../../core/models/common.model';
import { RegistryService } from '../../core/services/registry.service';
import { MaterialConsumptionReport, formatAverage } from './material-consumption';

const item = (over: Partial<ItemConsumption>): ItemConsumption => ({
  id: 'i',
  category: 'anesthesia',
  name: 'Lidocaine',
  brand: null,
  spec: null,
  unit: 'cartridge',
  archived: false,
  used: [0, 0, 0, 0, 0, 0],
  total: 0,
  monthlyAverage: null,
  ...over,
});

/** Recording began on the 20th of month five; month six is this one. */
const report = (over: Partial<MaterialConsumption> = {}): MaterialConsumption => ({
  months: [
    { month: '1405/03', tracked: false, trackedFromDay: null, current: false },
    { month: '1405/04', tracked: false, trackedFromDay: null, current: false },
    { month: '1405/05', tracked: false, trackedFromDay: null, current: false },
    { month: '1405/06', tracked: false, trackedFromDay: null, current: false },
    { month: '1405/07', tracked: true, trackedFromDay: 20, current: false },
    { month: '1405/08', tracked: true, trackedFromDay: null, current: true },
  ],
  trackedFrom: '1405/07/20',
  items: [
    item({ id: 'a', used: [0, 0, 0, 0, 40, 12], total: 52 }),
    item({
      id: 'b',
      category: 'implant',
      name: 'Bone Level',
      brand: 'Straumann',
      spec: '4.1x10',
      unit: 'piece',
      used: [0, 0, 0, 0, 2, 0],
      total: 2,
      monthlyAverage: 2.5,
      archived: true,
    }),
  ],
  ...over,
});

describe('MaterialConsumptionReport', () => {
  let calls: { months: number; q: string }[];
  let answer: () => Observable<MaterialConsumption>;

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    answer = () => of(report());
  });

  afterEach(() => vi.useRealTimers());

  function render() {
    TestBed.configureTestingModule({
      imports: [MaterialConsumptionReport],
      providers: [
        provideTranslateService(),
        {
          provide: RegistryService,
          useValue: {
            materialConsumption: (months: number, q: string) => {
              calls.push({ months, q });
              return answer();
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MaterialConsumptionReport);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = (selector: string) =>
      [...el.querySelectorAll(selector)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim());
    return { fixture, el, text };
  }

  it('loads six months straight away, without waiting for a search', () => {
    render();
    expect(calls).toEqual([{ months: 6, q: '' }]);
  });

  it('heads each month with its name, and marks where recording began and this month', () => {
    const { el } = render();
    const heads = [...el.querySelectorAll('thead .usage__month')].map((th) =>
      [...th.querySelectorAll('span')].map((s) => s.textContent?.trim()).join(' '),
    );
    expect(heads).toEqual([
      'month.khordad ۱۴۰۵',
      'month.tir ۱۴۰۵',
      'month.mordad ۱۴۰۵',
      'month.shahrivar ۱۴۰۵',
      'month.mehr ۱۴۰۵ consumption.fromDay',
      'month.aban ۱۴۰۵ consumption.soFar',
    ]);
  });

  it('groups by shelf in the store’s order, with unknown months apart from zero', () => {
    const { el, text } = render();
    expect(text('.usage__group-label')).toEqual([
      'deployed_code inventoryCategory.implant',
      'syringe inventoryCategory.anesthesia',
    ]);
    const rows = [...el.querySelectorAll('tbody tr:not(.usage__group)')];
    const implant = rows[0];
    expect(implant.querySelector('.usage__name')?.textContent).toBe('Bone Level');
    expect(implant.querySelector('.usage__detail')?.textContent).toBe('Straumann · 4.1x10');
    expect(implant.querySelector('.usage__archived')).not.toBeNull();
    const cells = [...implant.querySelectorAll('.usage__cell')];
    expect(cells.slice(0, 4).every((c) => c.classList.contains('usage__cell--none'))).toBe(true);
    expect(cells[4].textContent?.trim()).toBe('۲');
    expect(cells[5].classList).toContain('usage__cell--zero');
    expect(implant.querySelector('td.usage__average')?.textContent?.trim()).toBe('۲٫۵');
    // No complete month yet: no average to show.
    expect(rows[1].querySelector('td.usage__average')?.textContent?.trim()).toBe('—');
    expect(text('.consumption__note')[0]).toContain('consumption.trackedFrom');
  });

  it('narrows to one shelf from its chip', () => {
    const { fixture, el } = render();
    (fixture.componentInstance as unknown as { setCategory(v: string[]): void }).setCategory([
      'implant',
    ]);
    fixture.detectChanges();
    expect(el.querySelectorAll('.usage__group')).toHaveLength(1);
    expect(el.querySelectorAll('tbody tr:not(.usage__group)')).toHaveLength(1);
  });

  it('keeps the shelf filtered on in view, to clear, when a search finds none of it', () => {
    const { fixture, el, text } = render();
    const view = fixture.componentInstance as unknown as {
      setCategory(v: string[]): void;
      search: { setValue(v: string): void };
    };
    view.setCategory(['implant']);
    // The search finds only anaesthetics: one shelf in the answer, none of it implants.
    answer = () => of(report({ items: [item({ id: 'a', used: [0, 0, 0, 0, 40, 12] })] }));
    view.search.setValue('lidocaine');
    vi.advanceTimersByTime(250);
    fixture.detectChanges();

    expect(text('.consumption__empty')).toEqual(['consumption.noMatch']);
    const chips = el.querySelector('pb-filter-chips');
    expect(chips?.textContent).toContain('inventoryCategory.implant');

    view.setCategory([]);
    fixture.detectChanges();
    expect(el.querySelectorAll('.usage__group')).toHaveLength(1);
  });

  it('asks again for twelve months, and for a search once typing pauses', () => {
    const { fixture } = render();
    const view = fixture.componentInstance as unknown as {
      setPeriod(v: string): void;
      search: { setValue(v: string): void };
    };
    view.setPeriod('12');
    view.search.setValue(' straumann ');
    vi.advanceTimersByTime(250);
    expect(calls).toEqual([
      { months: 6, q: '' },
      { months: 12, q: '' },
      { months: 12, q: 'straumann' },
    ]);
  });

  it('tells an empty store from an empty search', () => {
    answer = () => of(report({ trackedFrom: null, items: [] }));
    const empty = render();
    expect(empty.text('.consumption__empty')).toEqual(['consumption.noStock']);
  });

  it('says so, with a retry, when the report fails to load', () => {
    answer = () => throwError(() => new Error('boom'));
    const { fixture, el } = render();
    expect(el.textContent).toContain('consumption.loadFailed');
    answer = () => of(report());
    (fixture.componentInstance as unknown as { retry(): void }).retry();
    fixture.detectChanges();
    expect(el.querySelector('table.usage')).not.toBeNull();
  });
});

describe('formatAverage', () => {
  it('writes Persian digits and decimal mark, one decimal at most', () => {
    expect(formatAverage(12.5)).toBe('۱۲٫۵');
    expect(formatAverage(3)).toBe('۳');
  });
});
