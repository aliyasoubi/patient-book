import {
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { PatientsService } from '../../features/patients/data/patients.service';
import { RecentPatientsService } from '../../features/patients/data/recent-patients.service';
import type { PatientSuggestion } from '../../features/patients/data/patient.model';
import { PbIcon, type LineIconName } from '../../shared/ui';
import { foldPersian } from '../../shared/text';
import { formatPhone } from '../../shared/pipes/phone.pipe';
import { SHELL_NAV } from '../shell-nav';
import { SpotlightService } from './spotlight.service';

/** Below this, a Persian query is too broad to be worth a round trip. */
const MIN_QUERY_LENGTH = 2;

/** Literal keys, so the i18n check can see every one is translated. */
const MATCH_KEYS: Readonly<Record<NonNullable<PatientSuggestion['match']>, string>> = {
  fileNo: 'globalSearch.match.fileNo',
  nationalId: 'globalSearch.match.nationalId',
  mobile: 'globalSearch.match.mobile',
};

/** One row: a patient, a page, or a quick action. */
interface SpotlightRow {
  id: string;
  group: 'patients' | 'pages' | 'actions';
  icon: LineIconName;
  label: string;
  meta?: string | null;
  supporting?: string | null;
  tag?: string | null;
  run: () => void;
}

interface SuggestionResult {
  q: string;
  items: PatientSuggestion[];
  failed?: boolean;
}

/**
 * The app's search, as a spotlight: a field in the middle of the screen over
 * a blurred app, answering as you type with patients, the page you might be
 * looking for, and the few things staff start most. Arrow keys walk the
 * rows, Enter opens one — or, with none picked, searches the whole register
 * for what was typed — and Escape or a click outside closes it.
 *
 * Opened by `SpotlightService` (the sidebar's search, the toolbar's field)
 * and by Ctrl+Space from anywhere.
 */
@Component({
  selector: 'pb-spotlight',
  standalone: true,
  imports: [PbIcon, TranslatePipe],
  templateUrl: './spotlight.html',
  styleUrl: './spotlight.scss',
})
export class Spotlight {
  protected readonly spotlight = inject(SpotlightService);
  private readonly auth = inject(AuthService);
  private readonly patients = inject(PatientsService);
  private readonly recent = inject(RecentPatientsService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly injector = inject(Injector);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly loading = signal(false);

  private readonly trimmed = computed(() => this.query().trim());

  /** Debounced, and `switchMap` so a slow earlier answer never lands over a newer one. */
  private readonly results = toSignal(
    toObservable(this.trimmed).pipe(
      debounceTime(180),
      distinctUntilChanged(),
      tap((q) => this.loading.set(q.length >= MIN_QUERY_LENGTH)),
      switchMap((q) =>
        q.length < MIN_QUERY_LENGTH
          ? of<SuggestionResult>({ q, items: [] })
          : this.patients.suggest(q).pipe(
              map((items): SuggestionResult => ({ q, items })),
              catchError(() => of<SuggestionResult>({ q, items: [], failed: true })),
            ),
      ),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: { q: '', items: [] } as SuggestionResult },
  );

  protected readonly rows = computed<SpotlightRow[]>(() => {
    this.i18n.currentLang();
    const q = this.trimmed();
    const folded = foldPersian(q);
    const unnamed = this.i18n.instant('patient.unnamed');
    const rows: SpotlightRow[] = [];

    const patients = q
      ? this.results().q === q
        ? this.results().items.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            fileNo: p.fileNo,
            mobile: p.mobile,
            tag: p.match ? this.i18n.instant(MATCH_KEYS[p.match]) : null,
          }))
        : []
      : this.recent.items().map((p) => ({ ...p, mobile: null, tag: null }));
    for (const p of patients.slice(0, 6)) {
      rows.push({
        id: `patient:${p.id}`,
        group: 'patients',
        icon: q ? 'user' : 'clock',
        label: p.fullName || unnamed,
        meta: p.fileNo,
        supporting: formatPhone(p.mobile),
        tag: p.tag,
        run: () => this.go(['/patients', p.id]),
      });
    }

    for (const item of SHELL_NAV) {
      if (item.roles && !item.roles.includes(this.auth.role() ?? 'viewer')) continue;
      const label = this.i18n.instant(item.label);
      if (q && !foldPersian(label).includes(folded)) continue;
      if (!q && rows.filter((r) => r.group === 'pages').length >= 4) continue;
      rows.push({
        id: `page:${item.path}`,
        group: 'pages',
        icon: item.icon,
        label,
        run: () => this.go([item.path]),
      });
    }

    const actions: { key: string; icon: LineIconName; path: string; allowed: boolean }[] = [
      {
        key: 'spotlight.newPatient',
        icon: 'user-plus',
        path: '/patients/new',
        allowed: this.auth.can('editPatients'),
      },
      {
        key: 'spotlight.newFollowUp',
        icon: 'calendar-check',
        path: '/surgery/new',
        allowed: this.auth.can('editSurgery'),
      },
      {
        key: 'spotlight.newLabCase',
        icon: 'flask',
        path: '/labs/new',
        allowed: this.auth.can('editLabs'),
      },
    ];
    for (const action of actions) {
      if (!action.allowed) continue;
      const label = this.i18n.instant(action.key);
      if (q && !foldPersian(label).includes(folded)) continue;
      rows.push({
        id: `action:${action.path}`,
        group: 'actions',
        icon: action.icon,
        label,
        run: () => this.go([action.path]),
      });
    }
    return rows;
  });

  /** The rows, grouped for display, each keeping its place in the flat list the keys walk. */
  protected readonly groups = computed(() => {
    const titles: Record<SpotlightRow['group'], string> = {
      patients: this.trimmed() ? 'spotlight.patients' : 'globalSearch.recent',
      pages: 'spotlight.pages',
      actions: 'spotlight.actions',
    };
    const order: SpotlightRow['group'][] = ['patients', 'pages', 'actions'];
    return order
      .map((group) => ({
        group,
        title: titles[group],
        rows: this.rows()
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => row.group === group),
      }))
      .filter((g) => g.rows.length);
  });

  /** Typed enough to search, and the answer for exactly this is in. */
  protected readonly answered = computed(
    () => this.trimmed().length >= MIN_QUERY_LENGTH && this.results().q === this.trimmed(),
  );
  protected readonly failed = computed(() => this.answered() && !!this.results().failed);

  constructor() {
    // Opening: a fresh field with the caret in it. Closing: forget the query.
    effect(() => {
      if (this.spotlight.isOpen()) {
        this.query.set('');
        this.active.set(0);
        afterNextRender(() => this.field()?.nativeElement.focus(), { injector: this.injector });
      }
    });
    // A new list starts at its first row.
    effect(() => {
      this.rows();
      this.active.set(0);
    });
  }

  /** Ctrl+Space from anywhere toggles it. */
  @HostListener('document:keydown', ['$event'])
  protected onGlobalKey(event: KeyboardEvent): void {
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === 'Space') {
      event.preventDefault();
      // Not over the first-sign-in gate: nothing opens until the password is changed.
      if (this.auth.user()?.mustChangePassword) return;
      this.spotlight.toggle();
    }
  }

  /** A press on the blurred backdrop closes, as a click outside any popover does. */
  @HostListener('pointerdown', ['$event'])
  protected onScrim(event: PointerEvent): void {
    if ((event.target as HTMLElement).classList.contains('spotlight__scrim')) {
      this.spotlight.close();
    }
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.rows().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.setActive((this.active() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.setActive((this.active() - 1 + count) % count);
        break;
      case 'Enter':
        event.preventDefault();
        this.enter();
        break;
      case 'Escape':
        event.preventDefault();
        this.spotlight.close();
        break;
    }
  }

  protected setActive(index: number): void {
    this.active.set(index);
    afterNextRender(
      () =>
        this.list()
          ?.nativeElement.querySelector('[data-active="true"]')
          ?.scrollIntoView({ block: 'nearest' }),
      { injector: this.injector },
    );
  }

  /** Enter: the row under the cursor; with nothing to pick, the full patient search. */
  private enter(): void {
    const row = this.rows()[this.active()];
    if (row) {
      row.run();
      return;
    }
    const q = this.trimmed();
    if (q) this.go(['/patients'], { q });
  }

  protected searchAll(): void {
    this.go(['/patients'], { q: this.trimmed() });
  }

  private go(commands: unknown[], queryParams?: Record<string, string>): void {
    this.spotlight.close();
    void this.router.navigate(commands, queryParams ? { queryParams } : {});
  }
}
