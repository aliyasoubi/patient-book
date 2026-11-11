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
  callsToday: 0,
  labsOverdue: 0,
  labsToBook: 0,
  inventoryReorder: 0,
  inventoryExpiring: 0,
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
    const followUpsPanel = () => el.querySelector('.agenda')?.textContent ?? '';
    /** A count's label and the list it opens, from the focus row or the queue. */
    const counts = () =>
      [...el.querySelectorAll<HTMLAnchorElement>('.focus__card, .queue__row')].map((a) => ({
        label: a.querySelector('.focus__label, .queue__label')?.textContent?.trim(),
        href: a.getAttribute('href'),
        clear: a.classList.contains('is-clear'),
      }));
    return { fixture, el, followUpsPanel, counts };
  }

  it('keeps the follow-ups up when the counts fail, and the counts away', () => {
    const { fixture, el, followUpsPanel, counts } = render();
    dashboard$.error(new Error('down'));
    followUps$.next([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('dashboard.loadFailed');
    expect(followUpsPanel()).toContain('dashboard.followUpsEmpty');
    expect(counts()).toEqual([]);
  });

  it('never says "nobody to call" while the follow-ups are in flight', () => {
    const { fixture, followUpsPanel } = render();
    expect(followUpsPanel()).not.toContain('dashboard.followUpsEmpty');
    followUps$.next([]);
    fixture.detectChanges();
    expect(followUpsPanel()).toContain('dashboard.followUpsEmpty');
  });

  it('puts what cannot wait first, then the routine queue', () => {
    const { fixture, counts } = render();
    dashboard$.next(summary({ callsToday: 3, labsOverdue: 1 }));
    fixture.detectChanges();
    expect(counts().map((c) => c.label)).toEqual([
      'tile.callsToday',
      'tile.followUpsOverdue',
      'tile.labsOverdue',
      'tile.needsReview',
      'tile.labsToBook',
      'tile.followUpsThisWeek',
      'tile.inventoryReorder',
      'tile.inventoryExpiring',
      'tile.recall',
    ]);
  });

  it('opens exactly the list each count counts', () => {
    const { fixture, counts } = render();
    dashboard$.next(summary({ callsToday: 2, labsToBook: 4, inactiveOverYear: 9 }));
    fixture.detectChanges();
    const href = (label: string) => counts().find((c) => c.label === label)?.href;
    expect(href('tile.callsToday')).toBe('/surgery?followUp=callsToday');
    expect(href('tile.labsToBook')).toBe('/labs?toBook=true');
    expect(href('tile.recall')).toBe('/patients?inactiveMonths=12');
  });

  it('says a list is clear rather than going quiet at zero', () => {
    const { fixture, counts } = render();
    dashboard$.next(summary({ needsReview: 0, labsOverdue: 5 }));
    fixture.detectChanges();
    const byLabel = (label: string) => counts().find((c) => c.label === label);
    expect(byLabel('tile.needsReview')?.clear).toBe(true);
    expect(byLabel('tile.labsOverdue')?.clear).toBe(false);
  });

  it('turns the greeting over on a dashboard left open', () => {
    const { fixture, el } = render();
    expect(el.textContent).toContain('greeting.morning');

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(el.textContent).toContain('greeting.afternoon');
  });
});
