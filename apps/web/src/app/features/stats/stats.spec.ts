import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistryService } from '../../core/services/registry.service';
import type { PracticeStats } from '../../core/models/common.model';
import { Stats } from './stats';

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

  function render() {
    TestBed.configureTestingModule({
      imports: [Stats],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: RegistryService, useValue: { practiceStats: () => stats$ } },
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
    expect(el.querySelector('pb-stat-tile')).toBeNull();
  });

  it('links each total to its register, and leaves "seen lately" a plain figure', () => {
    const { fixture, el } = render();
    stats$.next(stats());
    fixture.detectChanges();

    const links = [...el.querySelectorAll('pb-stat-tile')].map(
      (t) => t.querySelector('a')?.getAttribute('href') ?? null,
    );
    expect(links).toEqual(['/patients', null, '/implants', '/ortho']);
  });

  it('charts twelve months to this one, with empty months as zero', () => {
    const { fixture, el } = render();
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

    const points = el.querySelector('.trend__line')!.getAttribute('d')!.split(' ');
    expect(points).toHaveLength(12);
    expect(points[0]).toBe('M0.0,16.0'); // 1404/08: 2 of a peak of 4.
    expect(points[5]).toMatch(/,32\.0$/); // A month with none is a real zero.
    expect(points[11]).toBe('L100.0,0.0'); // 1405/07, this month, the peak.
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
});
