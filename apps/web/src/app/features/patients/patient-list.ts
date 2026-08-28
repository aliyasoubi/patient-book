import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';

import { PatientsService, PatientQuery } from '../../core/services/patients.service';
import { AuthService } from '../../core/services/auth.service';
import { JalaliPipe } from '../../shared/pipes/jalali.pipe';
import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { TreatmentChips } from '../../shared/components/treatment-chips';
import { EmptyState } from '../../shared/components/empty-state';
import {
  EDUCATION_LEVELS,
  GENDERS,
  educationLabel,
  genderIcon,
  genderLabel,
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
import type { Patient, TreatmentType } from '../../core/models/patient.model';
import type { EducationLevel, Gender } from '../../core/models/patient.model';

/** `inactiveMonths` filter choices. Kept as strings — see PbSelectField. */
const INACTIVE_MONTHS_OPTIONS: SelectOption[] = [
  { value: '6', label: $localize`:@@filter.inactive6m:۶ ماه` },
  { value: '12', label: $localize`:@@filter.inactive1y:۱ سال` },
  { value: '24', label: $localize`:@@filter.inactive2y:۲ سال` },
  { value: '36', label: $localize`:@@filter.inactive3y:۳ سال` },
];

interface Filters {
  gender: Gender | '';
  education: EducationLevel | '';
  treatments: string[];
  hasIssues: boolean;
  hasMedicalHistory: boolean;
  inactiveMonths: number | null;
  includeArchived: boolean;
}

const EMPTY_FILTERS: Filters = {
  gender: '',
  education: '',
  treatments: [],
  hasIssues: false,
  hasMedicalHistory: false,
  inactiveMonths: null,
  includeArchived: false,
};

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
    PersianCountPipe,
    TreatmentChips,
    EmptyState,
    PbSearchField,
    PbSelectField,
    PbCheckboxField,
    PbButton,
    PbAvatar,
    PbPageHeader,
    MatIconModule,
  ],
  templateUrl: './patient-list.html',
  styleUrl: './patient-list.scss',
})
export class PatientList {
  private readonly service = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly breakpoints = inject(BreakpointObserver);
  protected readonly auth = inject(AuthService);

  protected readonly educationLabel = educationLabel;
  protected readonly educationLevels = EDUCATION_LEVELS;
  protected readonly genderFilterOptions: SelectOption[] = GENDERS.map((g) => ({
    value: g,
    label: genderLabel(g),
  }));
  protected readonly educationFilterOptions: SelectOption[] = EDUCATION_LEVELS.map((level) => ({
    value: level,
    label: educationLabel(level),
  }));
  protected readonly inactiveMonthsOptions = INACTIVE_MONTHS_OPTIONS;
  protected readonly allLabel = $localize`:@@filter.all:همه`;
  protected readonly noPreferenceLabel = $localize`:@@filter.noPreference:مهم نیست`;

  /** Card layout below this width; the table needs the horizontal room. */
  protected readonly isCompact = toSignal(
    this.breakpoints.observe('(max-width: 900px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly page = signal(1);
  protected readonly limit = signal(25);
  protected readonly sort = signal<{ by: string; dir: 'ASC' | 'DESC' }>({
    by: 'lastName',
    dir: 'ASC',
  });
  protected readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  protected readonly filtersOpen = signal(false);

  protected readonly loading = signal(false);
  protected readonly patients = signal<Patient[]>([]);
  protected readonly total = signal(0);
  protected readonly treatmentTypes = signal<TreatmentType[]>([]);

  /** Debounced so typing does not fire a request per keystroke. */
  private readonly debouncedQuery = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
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
      (f.includeArchived ? 1 : 0)
    );
  });

  protected readonly rangeLabel = computed(() => {
    const total = this.total();
    if (total === 0) return '';
    const from = (this.page() - 1) * this.limit() + 1;
    const to = Math.min(this.page() * this.limit(), total);
    return $localize`:@@pagination.range:${from}:from:–${to}:to: از ${total}:total:`;
  });

  constructor() {
    // Seed the box from ?q= so a link into a search reproduces it.
    const initialQuery = this.route.snapshot.queryParamMap.get('q');
    if (initialQuery) this.searchControl.setValue(initialQuery, { emitEvent: false });

    this.service.treatmentTypes().subscribe((types) => this.treatmentTypes.set(types));

    // Any change to query, paging, sorting or filters refetches. Resetting to
    // page 1 happens in the handlers, not here, so paging itself does not loop.
    effect(() => {
      const query = this.debouncedQuery();
      const page = this.page();
      const limit = this.limit();
      const sort = this.sort();
      const filters = this.filters();
      untracked(() => this.fetch(query, page, limit, sort, filters));
    });

    // Reflect the query in the URL so the browser Back button works and the
    // search is shareable between staff.
    effect(() => {
      const q = this.debouncedQuery();
      untracked(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: q ? { q } : {},
          replaceUrl: true,
        });
      });
    });
  }

  private fetch(
    q: string,
    page: number,
    limit: number,
    sort: { by: string; dir: 'ASC' | 'DESC' },
    filters: Filters,
  ): void {
    this.loading.set(true);
    const query: PatientQuery = {
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
      includeArchived: filters.includeArchived || undefined,
    };

    this.service.list(query).subscribe({
      next: (result) => {
        this.patients.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
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

  /** Tooltip for the review-needed flag on a row. */
  /** Shown where a patient record carries no name at all. */
  protected readonly unnamed = $localize`:@@patient.unnamed:بدون نام`;

  protected issueTooltip(count: number): string {
    return $localize`:@@patients.issueCount:${count}:count: مورد نیازمند بازبینی`;
  }

  protected callLabel(name: string): string {
    return $localize`:@@action.callPerson:تماس با ${name}:name:`;
  }

  protected readonly emptyTitle = $localize`:@@patients.emptyTitle:بیماری پیدا نشد`;

  protected emptyHint(): string {
    return this.searchControl.value || this.activeFilterCount() > 0
      ? $localize`:@@patients.emptyHintFiltered:عبارت جستجو یا فیلترها را تغییر دهید.`
      : $localize`:@@patients.emptyHintNone:هنوز پرونده‌ای ثبت نشده است.`;
  }

  protected open(patient: Patient): void {
    void this.router.navigate(['/patients', patient.id]);
  }

  /**
   * Exposed as methods rather than maps: a `*matRowDef` template local is typed
   * `any`, and a `$localize` template must be evaluated at call time.
   */
  protected readonly genderLabel = genderLabel;
  protected readonly genderIcon = genderIcon;

  /** Track by id — rows are replaced wholesale on every fetch. */
  protected trackById(_index: number, item: { id: string }): string {
    return item.id;
  }
}
