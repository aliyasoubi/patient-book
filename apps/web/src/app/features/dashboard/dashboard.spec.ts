import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { RegistryService } from '../../core/services/registry.service';
import type { DashboardSummary, FollowUpDue } from '../../core/models/common.model';
import { Dashboard } from './dashboard';

const summary = (over: Partial<DashboardSummary> = {}): DashboardSummary => ({
  needsReview: 0,
  followUpsThisWeek: 0,
  followUpsOverdue: 0,
  labsOverdue: 0,
  inactiveOverYear: 0,
  ...over,
});

describe('Dashboard', () => {
  let dashboard$: Subject<DashboardSummary>;
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
    expect(el.querySelector('pb-stat-tile')).toBeNull();
  });

  it('never says "nobody to call" while the follow-ups are in flight', () => {
    const { fixture, followUpsPanel } = render();
    dashboard$.next(summary());
    fixture.detectChanges();

    expect(followUpsPanel()).toContain('dashboard.followUpsLoading');
    expect(followUpsPanel()).not.toContain('dashboard.followUpsEmpty');

    followUps$.next([]);
    fixture.detectChanges();
    expect(followUpsPanel()).toContain('dashboard.followUpsEmpty');
  });

  it('shows only work: late lists when there are any, then this week and recall', () => {
    const { fixture, el } = render();
    dashboard$.next(summary({ labsOverdue: 2, inactiveOverYear: 40 }));
    fixture.detectChanges();

    const tiles = [...el.querySelectorAll('pb-stat-tile')];
    expect(tiles.map((t) => t.querySelector('.pb-stat-tile__label')?.textContent)).toEqual([
      'tile.needsReview',
      'tile.labsOverdue',
      'tile.followUpsThisWeek',
      'tile.recall',
    ]);
    // The recall tile opens exactly the list it counts.
    expect(tiles[3].querySelector('a')?.getAttribute('href')).toBe('/patients?inactiveMonths=12');
  });

  it('turns the greeting over on a dashboard left open', () => {
    const { fixture, el } = render();
    expect(el.textContent).toContain('greeting.morning');

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(el.textContent).toContain('greeting.afternoon');
  });
});
