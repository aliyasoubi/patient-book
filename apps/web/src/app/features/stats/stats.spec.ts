import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistryService } from '../../core/services/registry.service';
import { PatientsService } from '../patients/data/patients.service';
import type { PracticeStats } from '../../core/models/common.model';
import { Stats } from './stats';
import { StatsTrend } from './stats-trend';

const stats = (over: Partial<PracticeStats> = {}): PracticeStats => ({
  totals: {
    patients: 3,
    archived: 0,
    implantCases: 0,
    orthoCases: 0,
    recentlyActive: 0,
  },
  gender: [],
  topTreatments: [],
  topReferrals: [],
  newPatientsByMonth: [],
  ageBands: [],
  ...over,
});

describe('Stats', () => {
  let stats$: Subject<PracticeStats>;

  beforeEach(() => {
    // 10 Mehr 1405.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 11, 59, 30));
    stats$ = new Subject();
  });

  afterEach(() => vi.useRealTimers());

  function render(types: unknown[] = []) {
    TestBed.configureTestingModule({
      imports: [Stats],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: RegistryService, useValue: { practiceStats: () => stats$ } },
        { provide: PatientsService, useValue: { treatmentTypes: () => of(types) } },
      ],
    });
    const fixture = TestBed.createComponent(Stats);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('says so, with a retry, when the numbers fail to load', () => {
    const { fixture, el } = render();
    stats$.error(new Error('boom'));
    fixture.detectChanges();

    expect(el.textContent).toContain('stats.loadFailed');
    expect(el.querySelector('.kpi')).toBeNull();
  });

  it('links each total to its register, and leaves "seen lately" a plain figure', () => {
    const { fixture, el } = render();
    stats$.next(stats());
    fixture.detectChanges();

    const links = [...el.querySelectorAll('.kpi')].map((t) =>
      t.tagName === 'A' ? t.getAttribute('href') : null,
    );
    expect(links).toEqual(['/patients', null, '/implants', '/ortho']);
  });

  it('charts twelve months to this one, with empty months as zero', () => {
    const { fixture } = render();
    stats$.next(
      stats({
        newPatientsByMonth: [
          { month: '1403/01', count: 9 }, // Outside the window.
          { month: '1404/08', count: 2 },
          { month: '1405/07', count: 4 },
        ],
      }),
    );
    fixture.detectChanges();

    const chart = fixture.debugElement.query(By.directive(StatsTrend)).componentInstance;
    const counts = (chart as StatsTrend).trend().months.map((m) => m.count);
    expect(counts).toHaveLength(12);
    expect(counts[0]).toBe(2); // 1404/08, the oldest in the window.
    expect(counts[5]).toBe(0); // A month with none is a real zero.
    expect(counts[11]).toBe(4); // 1405/07, this month.
  });

  it('says so when a panel has nothing to show', () => {
    const { fixture, el } = render();
    stats$.next(stats());
    fixture.detectChanges();

    for (const panel of ['treatments', 'age', 'referrals']) {
      expect(el.querySelector(`.stats__panel--${panel}`)?.textContent).toContain('stats.noData');
    }
    expect(el.querySelector('.stats__panel--growth')?.textContent).toContain('stats.noChartData');
  });

  it('lists the treatment catalogue even before any figures arrive', () => {
    const { fixture, el } = render([
      { id: 't1', icon: 'dentistry', nameFa: 'ایمپلنت' },
      { id: 't2', icon: 'straighten', nameFa: 'ارتودنسی' },
    ]);
    fixture.detectChanges();

    const names = [...el.querySelectorAll('.catalogue__name')].map((n) => n.textContent?.trim());
    expect(names).toEqual(['ایمپلنت', 'ارتودنسی']);
  });
});
