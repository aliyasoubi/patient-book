import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
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
import { PatientListContext } from './patient-list-context';
import { AuthService } from '../../core/services/auth.service';
import { PageScroll } from '../../core/services/page-scroll.service';
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

/**
 * File number, newest first — matches the registry and surgery lists'
 * default ordering, and is what staff scan for first: the newest chart.
 */
interface SortState {
  by: string;
  dir: 'ASC' | 'DESC';
}

const DEFAULT_SORT: SortState = { by: 'fileNo', dir: 'DESC' };

/** The columns with a sort header; anything else in a URL is ignored. */
const SORT_COLUMNS = ['fileNo', 'lastName', 'birthDate', 'lastVisitAt'];

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZES = [10, DEFAULT_PAGE_SIZE, 50, 100];

/**
 * Cards below this width of the list itself, not of the viewport: the rail
 * takes 264px of a desktop window, and a seven-column table squeezed into
 * what is left scrolls sideways.
 */
const CARD_LAYOUT_BELOW = 880;

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
 * Everything that decides what the register shows. All of it lives in the
 * query string, with defaults left out so a plain `/patients` stays plain:
 * a dashboard tile can link straight to "needs review", staff can share a
 * search, and coming back from a patient's page — by the browser's Back or
 * the page's own — lands on the same page of the same sort, not page one.
 */
interface ListState {
  q: string;
  page: number;
  limit: number;
  sort: SortState;
  /** A column the user clicked; without one a search is ranked by relevance. */
  sortChosen: boolean;
  filters: Filters;
}

function positiveInt(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function readUrlState(params: ParamMap): ListState {
  const by = oneOf(params.get('sort'), SORT_COLUMNS);
  const dir = oneOf(params.get('dir'), ['asc', 'desc']);
  const chosen = by !== null && dir !== null;
  return {
    q: params.get('q')?.trim() ?? '',
    page: positiveInt(params.get('page')) ?? 1,
    limit: oneOf(params.get('limit'), PAGE_SIZES.map(String))
      ? Number(params.get('limit'))
      : DEFAULT_PAGE_SIZE,
    sort: chosen ? { by, dir: dir === 'asc' ? 'ASC' : 'DESC' } : DEFAULT_SORT,
    sortChosen: chosen,
    filters: {
      gender: oneOf(params.get('gender'), GENDERS) ?? '',
      education: oneOf(params.get('education'), EDUCATION_LEVELS) ?? '',
      treatments: params.get('treatments')?.split(',').filter(Boolean) ?? [],
      hasIssues: params.get('hasIssues') === 'true',
      hasMedicalHistory: params.get('hasMedicalHistory') === 'true',
      inactiveMonths: positiveInt(params.get('inactiveMonths')),
      referralSourceId: params.get('referralSourceId') || null,
      includeArchived: params.get('includeArchived') === 'true',
    },
  };
}

/** The inverse of {@link readUrlState}; `null` drops a parameter from the URL. */
function urlParams(state: ListState): Params {
  const f = state.filters;
  return {
    q: state.q || null,
    page: state.page > 1 ? state.page : null,
    limit: state.limit !== DEFAULT_PAGE_SIZE ? state.limit : null,
    sort: state.sortChosen ? state.sort.by : null,
    dir: state.sortChosen ? state.sort.dir.toLowerCase() : null,
    gender: f.gender || null,
    education: f.education || null,
    treatments: f.treatments.length ? f.treatments.join(',') : null,
    hasIssues: f.hasIssues ? 'true' : null,
    hasMedicalHistory: f.hasMedicalHistory ? 'true' : null,
    inactiveMonths: f.inactiveMonths,
    referralSourceId: f.referralSourceId,
    includeArchived: f.includeArchived ? 'true' : null,
  };
}

function sameFilters(a: Filters, b: Filters): boolean {
  return (
    a.gender === b.gender &&
    a.education === b.education &&
    a.treatments.length === b.treatments.length &&
    a.treatments.every((code, i) => code === b.treatments[i]) &&
    a.hasIssues === b.hasIssues &&
    a.hasMedicalHistory === b.hasMedicalHistory &&
    a.inactiveMonths === b.inactiveMonths &&
    a.referralSourceId === b.referralSourceId &&
    a.includeArchived === b.includeArchived
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
  host: { '[class.is-compact]': 'isCompact()' },
})
export class PatientList {
  private readonly service = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly context = inject(PatientListContext);
  private readonly pageScroll = inject(PageScroll);
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

  /** The list's own width, from a ResizeObserver; null until the first measurement. */
  private readonly width = signal<number | null>(null);

  /** Card layout when the list is too narrow for the table — see {@link CARD_LAYOUT_BELOW}. */
  protected readonly isCompact = computed(
    () => (this.width() ?? window.innerWidth) < CARD_LAYOUT_BELOW,
  );

  /** The desktop scroll container; rows scroll inside it, not the page. */
  private readonly tableWrap = viewChild<ElementRef<HTMLElement>>('tableWrap');
  /** Kept by a passive listener — see {@link PageScroll} for why not read on destroy. */
  private tableScrollTop = 0;

  // Seeded from the URL so the first fetch already carries a linked-in search
  // or filter; the subscription in the constructor keeps them in step after.
  private readonly initial = readUrlState(this.route.snapshot.queryParamMap);

  protected readonly searchControl = new FormControl(this.initial.q, { nonNullable: true });

  protected readonly page = signal(this.initial.page);
  protected readonly limit = signal(this.initial.limit);
  protected readonly sort = signal<SortState>(this.initial.sort);
  /**
   * Whether the column above came from a header click. A search is ranked by
   * relevance until then; a column the user picked stays in force through it.
   */
  private readonly sortChosen = signal(this.initial.sortChosen);
  protected readonly filters = signal<Filters>(this.initial.filters);
  protected readonly filtersOpen = signal(false);

  protected readonly loading = signal(false);
  /** The most recent request failed; whatever rows are shown are stale. */
  protected readonly failed = signal(false);
  protected readonly patients = signal<Patient[]>([]);
  protected readonly total = signal(0);
  /**
   * Stays up during a refetch, like the rows it counts: the previous result
   * is still on screen under the progress bar, and dropping the label would
   * shift the header for the length of the request.
   */
  protected readonly countLabel = computed(() => {
    const total = this.total();
    if (total === 0) return null;
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

  /** What the header arrows show: nothing while a search is ranked by relevance. */
  protected readonly headerSort = computed<{ active: string; direction: SortDirection }>(() => {
    if (this.debouncedQuery() && !this.sortChosen()) return { active: '', direction: '' };
    const sort = this.sort();
    return { active: sort.by, direction: sort.dir === 'ASC' ? 'asc' : 'desc' };
  });

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

    // The list's own width decides table or cards; the rail changes it
    // without the viewport moving, which a media query cannot see.
    const observer = new ResizeObserver(([entry]) => this.width.set(entry.contentRect.width));
    observer.observe(this.host.nativeElement);

    // Native and passive, not a template `(scroll)` binding: that would run
    // change detection on every scrolled frame of a 100-row table.
    effect((onCleanup) => {
      const wrap = this.tableWrap()?.nativeElement;
      if (!wrap) return;
      const onScroll = (): void => {
        this.tableScrollTop = wrap.scrollTop;
      };
      wrap.addEventListener('scroll', onScroll, { passive: true });
      onCleanup(() => wrap.removeEventListener('scroll', onScroll));
    });

    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      const url = this.context.url();
      if (url) {
        this.context.leave({ url, page: this.pageScroll.top, table: this.tableScrollTop });
      }
    });

    let restored = false;
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
        // Back where it was left, once the rows exist to scroll to. The
        // router's own restoration fires before the fetch and moves the
        // window, which is not what scrolls here — see PageScroll.
        if (restored) return;
        restored = true;
        const position = this.context.positionFor(this.router.url);
        if (!position) return;
        afterNextRender(
          () => {
            this.pageScroll.scrollTo(position.page);
            const wrap = this.tableWrap()?.nativeElement;
            if (wrap) wrap.scrollTop = position.table;
          },
          { injector: this.injector },
        );
      });

    // URL → state. The snapshot seeded the initial values; this catches the
    // URL changing under a live component — the global search box submitting
    // while this page is already open, a dashboard link, the Back button.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const url = readUrlState(params);
      // Compare with the last *committed* search, not the box: the box may
      // hold keystrokes newer than the URL echo of our own last write.
      if (url.q !== this.debouncedQuery()) this.searchControl.setValue(url.q);
      if (!sameFilters(url.filters, this.filters())) this.filters.set(url.filters);
      if (
        url.sortChosen !== this.sortChosen() ||
        url.sort.by !== this.sort().by ||
        url.sort.dir !== this.sort().dir
      ) {
        this.sort.set(url.sort);
        this.sortChosen.set(url.sortChosen);
      }
      if (url.limit !== this.limit()) this.limit.set(url.limit);
      if (url.page !== this.page()) this.page.set(url.page);
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
        this.sortChosen(),
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
    // `replaceUrl`: paging through the register is one history entry, not
    // one per page.
    effect(() => {
      const queryParams = urlParams({
        q: this.debouncedQuery(),
        page: this.page(),
        limit: this.limit(),
        sort: this.sort(),
        sortChosen: this.sortChosen(),
        filters: this.filters(),
      });
      untracked(() => {
        const tree = this.router.createUrlTree([], { relativeTo: this.route, queryParams });
        // What the address bar will show — recorded here rather than read
        // back from the router, whose URL is not yet this one during the
        // first activation and never re-emits for a write of the same URL.
        this.context.url.set(this.router.serializeUrl(tree));
        void this.router.navigateByUrl(tree, { replaceUrl: true });
      });
    });
  }

  private buildQuery(
    q: string,
    page: number,
    limit: number,
    sort: SortState,
    sortChosen: boolean,
    filters: Filters,
  ): PatientQuery {
    return {
      q: q || undefined,
      page,
      limit,
      // No column means the API ranks a search by relevance.
      sortBy: q && !sortChosen ? undefined : sort.by,
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
      this.sort.set(DEFAULT_SORT);
      this.sortChosen.set(false);
    } else {
      this.sort.set({ by: event.active, dir: event.direction === 'desc' ? 'DESC' : 'ASC' });
      this.sortChosen.set(true);
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

  /**
   * Bound to the table so a refetch that returns the same patients updates
   * the rows in place rather than tearing every one down and back up.
   */
  protected trackById(_index: number, item: { id: string }): string {
    return item.id;
  }
}
