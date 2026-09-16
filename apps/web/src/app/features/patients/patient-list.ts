import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  map,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PatientsService, PatientQuery } from './data/patients.service';
import { AuthService } from '../../core/services/auth.service';
import { JalaliPipe } from '../../shared/pipes/jalali.pipe';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { TreatmentChips } from '../../shared/components/treatment-chips';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import {
  EDUCATION_LEVELS,
  GENDERS,
  educationLabel,
  genderIcon,
  genderLabel,
  referralKindIcon,
} from '../../shared/labels';
import {
  PbAvatar,
  PbButton,
  PbCheckboxField,
  PbPageHeader,
  PbSearchField,
  PbSelectField,
} from '../../shared/ui';
import type { SelectOption } from '../../shared/ui';
import type { Patient, ReferralSource, TreatmentType } from './data/patient.model';
import type { EducationLevel, Gender } from '../../core/models/common.model';

/** `inactiveMonths` filter choices. Kept as strings — see PbSelectField. */
const INACTIVE_MONTHS_OPTIONS: SelectOption[] = [
  { value: '6', label: 'filter.inactive6m', translate: true },
  { value: '12', label: 'filter.inactive1y', translate: true },
  { value: '24', label: 'filter.inactive2y', translate: true },
  { value: '36', label: 'filter.inactive3y', translate: true },
];

interface Filters {
  gender: Gender | '';
  education: EducationLevel | '';
  treatments: string[];
  hasIssues: boolean;
  hasMedicalHistory: boolean;
  inactiveMonths: number | null;
  /** Only reachable from a dashboard link; there is no picker in the panel. */
  referralSourceId: string | null;
  includeArchived: boolean;
}

const EMPTY_FILTERS: Filters = {
  gender: '',
  education: '',
  treatments: [],
  hasIssues: false,
  hasMedicalHistory: false,
  inactiveMonths: null,
  referralSourceId: null,
  includeArchived: false,
};

/**
 * The filters that live in the query string, so a dashboard tile can link
 * straight to "needs review" or "inactive over a year" and a staff member can
 * share the resulting URL. The rest of the panel is session-only.
 */
type UrlFilters = Pick<Filters, 'hasIssues' | 'inactiveMonths' | 'referralSourceId'>;

function readUrlQuery(params: ParamMap): string {
  return params.get('q')?.trim() ?? '';
}

function readUrlFilters(params: ParamMap): UrlFilters {
  const months = Number(params.get('inactiveMonths'));
  return {
    hasIssues: params.get('hasIssues') === 'true',
    inactiveMonths: Number.isInteger(months) && months > 0 ? months : null,
    referralSourceId: params.get('referralSourceId') || null,
  };
}

function sameUrlFilters(a: UrlFilters, b: UrlFilters): boolean {
  return (
    a.hasIssues === b.hasIssues &&
    a.inactiveMonths === b.inactiveMonths &&
    a.referralSourceId === b.referralSourceId
  );
}

@Component({
  selector: 'pb-patient-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatChipsModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
    JalaliPipe,
    PersianNumberPipe,
    TreatmentChips,
    EmptyState,
    LoadError,
    PbSearchField,
    PbSelectField,
    PbCheckboxField,
    PbButton,
    PbAvatar,
    PbPageHeader,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './patient-list.html',
  styleUrl: './patient-list.scss',
})
export class PatientList {
  private readonly service = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly i18n = inject(TranslateService);
  protected readonly auth = inject(AuthService);

  protected readonly genderFilterOptions: SelectOption[] = GENDERS.map((g) => ({
    value: g,
    label: genderLabel(g),
    translate: true,
  }));
  protected readonly educationFilterOptions: SelectOption[] = EDUCATION_LEVELS.map((level) => ({
    value: level,
    label: educationLabel(level),
    translate: true,
  }));
  protected readonly inactiveMonthsOptions = INACTIVE_MONTHS_OPTIONS;

  /** Card layout below this width; the table needs the horizontal room. */
  protected readonly isCompact = toSignal(
    this.breakpoints.observe('(max-width: 900px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  // Seeded from the URL so the first fetch already carries a linked-in search
  // or filter; the subscription in the constructor keeps them in step after.
  protected readonly searchControl = new FormControl(
    readUrlQuery(this.route.snapshot.queryParamMap),
    { nonNullable: true },
  );

  protected readonly page = signal(1);
  protected readonly limit = signal(25);
  protected readonly sort = signal<{ by: string; dir: 'ASC' | 'DESC' }>({
    by: 'lastName',
    dir: 'ASC',
  });
  protected readonly filters = signal<Filters>({
    ...EMPTY_FILTERS,
    ...readUrlFilters(this.route.snapshot.queryParamMap),
  });
  protected readonly filtersOpen = signal(false);

  protected readonly loading = signal(false);
  /** The most recent request failed; whatever rows are shown are stale. */
  protected readonly failed = signal(false);
  protected readonly patients = signal<Patient[]>([]);
  protected readonly total = signal(0);
  protected readonly countLabel = computed(() => {
    const total = this.total();
    if (this.loading() || total === 0) return null;
    this.i18n.currentLang();
    const count = formatPersianCount(total);
    return this.i18n.instant('count.records', { count });
  });
  protected readonly treatmentTypes = signal<TreatmentType[]>([]);

  /**
   * Debounced so typing does not fire a request per keystroke. A new search
   * starts from page 1: results for "Ali" on page 3 say nothing about page 3
   * of "Alireza", and can be empty while matches exist.
   */
  private readonly debouncedQuery = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
      tap(() => this.page.set(1)),
    ),
    { initialValue: this.searchControl.value.trim() },
  );

  /**
   * The referral chip needs a name; the id in the URL means nothing to staff.
   * There is no lookup-by-id endpoint, but the list is a clinic's handful of
   * sources, and `switchMap` drops a lookup the filter has since moved past.
   */
  protected readonly referralSource = toSignal(
    toObservable(computed(() => this.filters().referralSourceId)).pipe(
      switchMap((id) =>
        id
          ? this.service.referralSources().pipe(
              map((all) => all.find((r) => r.id === id) ?? null),
              catchError(() => of<ReferralSource | null>(null)),
            )
          : of<ReferralSource | null>(null),
      ),
    ),
    { initialValue: null as ReferralSource | null },
  );

  protected readonly columns = computed(() => [
    'fileNo',
    'name',
    'contact',
    'age',
    'treatments',
    'lastVisit',
    'actions',
  ]);

  protected readonly activeFilterCount = computed(() => {
    const f = this.filters();
    return (
      (f.gender ? 1 : 0) +
      (f.education ? 1 : 0) +
      f.treatments.length +
      (f.hasIssues ? 1 : 0) +
      (f.hasMedicalHistory ? 1 : 0) +
      (f.inactiveMonths ? 1 : 0) +
      (f.referralSourceId ? 1 : 0) +
      (f.includeArchived ? 1 : 0)
    );
  });

  /**
   * One persistent subscription, fed by the effect below. `switchMap` cancels
   * the in-flight request when a newer query arrives, so a slow "Ali" request
   * can no longer resolve after a faster "Alireza" one and overwrite it.
   */
  private readonly fetchTrigger$ = new Subject<PatientQuery>();

  /** Bumped by {@link retry} to re-run the current query unchanged. */
  private readonly reloadTick = signal(0);

  constructor() {
    this.service.treatmentTypes().subscribe((types) => this.treatmentTypes.set(types));

    this.fetchTrigger$
      .pipe(
        switchMap((query) =>
          this.service.list(query).pipe(
            // Keep the previous rows on screen under a banner rather than
            // blanking the register: a blank list reads as "no patients".
            catchError(() => {
              this.loading.set(false);
              this.failed.set(true);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.patients.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      });

    // URL → state. The snapshot seeded the initial values; this catches the
    // URL changing under a live component — the global search box submitting
    // while this page is already open, a dashboard link, the Back button.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      // Compare with the last *committed* search, not the box: the box may
      // hold keystrokes newer than the URL echo of our own last write.
      const q = readUrlQuery(params);
      if (q !== this.debouncedQuery()) this.searchControl.setValue(q);

      const next = readUrlFilters(params);
      if (!sameUrlFilters(next, this.filters())) {
        this.filters.update((f) => ({ ...f, ...next }));
        this.page.set(1);
      }
    });

    // Any change to query, paging, sorting or filters refetches. Resetting to
    // page 1 happens in the handlers, not here, so paging itself does not loop.
    effect(() => {
      this.reloadTick();
      const query = this.buildQuery(
        this.debouncedQuery(),
        this.page(),
        this.limit(),
        this.sort(),
        this.filters(),
      );
      untracked(() => {
        this.loading.set(true);
        this.failed.set(false);
        this.fetchTrigger$.next(query);
      });
    });

    // State → URL, so the browser Back button works and the search is
    // shareable between staff. Writing the same URL again is a no-op for the
    // router, which is what stops this and the subscription above looping.
    effect(() => {
      const q = this.debouncedQuery();
      const { hasIssues, inactiveMonths, referralSourceId } = this.filters();
      untracked(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {
            q: q || null,
            hasIssues: hasIssues ? 'true' : null,
            inactiveMonths,
            referralSourceId,
          },
          replaceUrl: true,
        });
      });
    });
  }

  private buildQuery(
    q: string,
    page: number,
    limit: number,
    sort: { by: string; dir: 'ASC' | 'DESC' },
    filters: Filters,
  ): PatientQuery {
    return {
      q: q || undefined,
      page,
      limit,
      sortBy: q ? undefined : sort.by,
      sortDir: sort.dir,
      gender: filters.gender || undefined,
      education: filters.education || undefined,
      treatments: filters.treatments.length ? filters.treatments : undefined,
      hasIssues: filters.hasIssues || undefined,
      hasMedicalHistory: filters.hasMedicalHistory || undefined,
      inactiveMonths: filters.inactiveMonths ?? undefined,
      referralSourceId: filters.referralSourceId ?? undefined,
      includeArchived: filters.includeArchived || undefined,
    };
  }

  protected retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected onSortChange(event: Sort): void {
    if (!event.direction) {
      this.sort.set({ by: 'lastName', dir: 'ASC' });
    } else {
      this.sort.set({ by: event.active, dir: event.direction === 'desc' ? 'DESC' : 'ASC' });
    }
    this.page.set(1);
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
  }

  protected updateFilter<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.page.set(1);
  }

  /** `PbSelectField` speaks strings; the inactive-months filter is a number. */
  protected readonly inactiveMonthsValue = computed(() => {
    const months = this.filters().inactiveMonths;
    return months ? String(months) : '';
  });

  protected updateInactiveMonths(value: string): void {
    this.updateFilter('inactiveMonths', value ? Number(value) : null);
  }

  protected toggleTreatment(code: string): void {
    this.filters.update((f) => ({
      ...f,
      treatments: f.treatments.includes(code)
        ? f.treatments.filter((c) => c !== code)
        : [...f.treatments, code],
    }));
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.filters.set({ ...EMPTY_FILTERS });
    this.page.set(1);
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
  }

  protected issueTooltip(count: number): string {
    return this.i18n.instant('patients.issueCount', { count });
  }

  protected callLabel(name: string): string {
    return this.i18n.instant('action.callPerson', { name });
  }

  protected emptyHint(): string {
    return this.searchControl.value || this.activeFilterCount() > 0
      ? this.i18n.instant('patients.emptyHintFiltered')
      : this.i18n.instant('patients.emptyHintNone');
  }

  /**
   * Exposed as methods rather than maps because a `*matRowDef` local is `any`.
   */
  protected readonly genderLabel = genderLabel;
  protected readonly genderIcon = genderIcon;
  protected readonly referralKindIcon = referralKindIcon;

  /** Track by id — rows are replaced wholesale on every fetch. */
  protected trackById(_index: number, item: { id: string }): string {
    return item.id;
  }
}
