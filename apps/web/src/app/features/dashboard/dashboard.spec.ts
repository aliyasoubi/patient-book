import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { RegistryService } from '../../core/services/registry.service';
import type { DashboardStats, FollowUpDue } from '../../core/models/common.model';
import { Dashboard } from './dashboard';

const stats = (over: Partial<DashboardStats> = {}): DashboardStats => ({
  totals: {
    patients: 3,
    archived: 0,
    implantCases: 0,
    orthoCases: 0,
    followUpsThisWeek: 0,
    followUpsOverdue: 0,
    labsOverdue: 0,
    inventoryReorder: 0,
    inventoryExpiring: 0,
    needsReview: 0,
  },
  gender: [],
  topTreatments: [],
  topReferrals: [],
  newPatientsByMonth: [],
  ageBands: [],
  recentlyActive: 0,
  inactiveOverYear: 0,
  ...over,
});

describe('Dashboard', () => {
  let dashboard$: Subject<DashboardStats>;
  let followUps$: Subject<FollowUpDue[]>;

  beforeEach(() => {
    // 10 Mehr 1405, half a minute before noon.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 2, 11, 59, 30));
    dashboard$ = new Subject();
    followUps$ = new Subject();
  });

  afterEach(() => vi.useRealTimers());

  function render() {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        {
          provide: RegistryService,
          useValue: { dashboard: () => dashboard$, followUpsThisWeek: () => followUps$ },
        },
        { provide: AuthService, useValue: { can: () => false, user: signal(null) } },
      ],
    });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const followUpsPanel = () => el.querySelector('.dash__panel--follow-ups')?.textContent ?? '';
    return { fixture, el, followUpsPanel };
  }

  it('keeps the clock and follow-ups up when the totals fail', () => {
    const { fixture, el, followUpsPanel } = render();
    dashboard$.error(new Error('boom'));
    followUps$.next([]);
    fixture.detectChanges();

    expect(el.textContent).toContain('dashboard.loadFailed');
    expect(el.querySelector('pb-datetime-card')).not.toBeNull();
    expect(followUpsPanel()).toContain('dashboard.followUpsEmpty');
    expect(el.querySelector('.dash__panel--recall')).toBeNull();
  });

  it('never says "nobody to call" while the follow-ups are in flight', () => {
    const { fixture, followUpsPanel } = render();
    dashboard$.next(stats());
    fixture.detectChanges();

    expect(followUpsPanel()).toContain('dashboard.followUpsLoading');
    expect(followUpsPanel()).not.toContain('dashboard.followUpsEmpty');

    followUps$.next([]);
    fixture.detectChanges();
    expect(followUpsPanel()).toContain('dashboard.followUpsEmpty');
  });

  it('charts twelve months to this one, with empty months as zero', () => {
    const { fixture, el } = render();
    dashboard$.next(
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

  it('turns the greeting over on a dashboard left open', () => {
    const { fixture, el } = render();
    expect(el.textContent).toContain('greeting.morning');

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(el.textContent).toContain('greeting.afternoon');
  });

  it('says so when a panel has nothing to show', () => {
    const { fixture, el } = render();
    dashboard$.next(stats());
    fixture.detectChanges();

    for (const panel of ['treatments', 'age', 'referrals']) {
      expect(el.querySelector(`.dash__panel--${panel}`)?.textContent).toContain('dashboard.noData');
    }
    expect(el.querySelector('.dash__panel--growth')?.textContent).toContain(
      'dashboard.noChartData',
    );
  });
});
