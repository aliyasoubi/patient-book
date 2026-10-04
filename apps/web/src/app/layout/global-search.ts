import {
  Component,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import { PatientsService } from '../features/patients/data/patients.service';
import { RecentPatientsService } from '../features/patients/data/recent-patients.service';
import type { PatientSuggestion } from '../features/patients/data/patient.model';
import { PbIconButton, PbSearchField, type SearchFieldOption } from '../shared/ui';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

/** Below this, a Persian query is too broad to be worth a round trip. */
const MIN_QUERY_LENGTH = 2;

/** Literal keys, so the i18n check can see every one is translated. */
const MATCH_KEYS: Readonly<Record<NonNullable<PatientSuggestion['match']>, string>> = {
  fileNo: 'globalSearch.match.fileNo',
  nationalId: 'globalSearch.match.nationalId',
  mobile: 'globalSearch.match.mobile',
};

/** Suggestions, with the query they answer — Enter must not act on an older one. */
interface SuggestionResult {
  q: string;
  items: PatientSuggestion[];
}

@Component({
  selector: 'pb-global-search',
  standalone: true,
  imports: [PbSearchField, PbIconButton, TranslatePipe],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
})
export class GlobalSearch {
  private readonly patients = inject(PatientsService);
  private readonly recent = inject(RecentPatientsService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly injector = inject(Injector);

  private readonly searchField = viewChild<PbSearchField>('searchField');

  /**
   * Fold to a single button, for a page that has a search field of its own
   * — two look-alike inputs one above the other read as two different
   * searches. Ctrl/Cmd+K and the button open the full field.
   */
  readonly compact = input(false);
  protected readonly expanded = signal(false);

  protected readonly control = new FormControl('', { nonNullable: true });
  protected readonly loading = signal(false);

  constructor() {
    // Leaving the page that asked for the button puts the field back.
    effect(() => {
      if (!this.compact()) this.expanded.set(false);
    });
  }

  /** What is in the field now, undebounced: an empty field offers recent files at once. */
  private readonly query = toSignal(this.control.valueChanges.pipe(map((value) => value.trim())), {
    initialValue: '',
  });

  /**
   * Suggestions for the type-ahead. Debounced so a fast typist issues one
   * request rather than one per keystroke, and `switchMap` so a slow earlier
   * response can never overwrite a newer one.
   */
  private readonly results = toSignal(
    this.control.valueChanges.pipe(
      startWith(''),
      debounceTime(220),
      map((value) => value.trim()),
      distinctUntilChanged(),
      tap((q) => this.loading.set(q.length >= MIN_QUERY_LENGTH)),
      switchMap((q) => {
        if (q.length < MIN_QUERY_LENGTH) {
          this.loading.set(false);
          return of<SuggestionResult>({ q, items: [] });
        }
        return this.patients.suggest(q).pipe(
          map((items): SuggestionResult => ({ q, items })),
          tap(() => this.loading.set(false)),
          // A failed suggestion must not tear down the stream; the search box
          // has to keep working for the next keystroke.
          catchError(() => {
            this.loading.set(false);
            return of<SuggestionResult>({ q, items: [] });
          }),
        );
      }),
    ),
    { initialValue: { q: '', items: [] } as SuggestionResult },
  );

  protected readonly searchOptions = computed<SearchFieldOption[]>(() => {
    this.i18n.currentLang();
    const unnamed = this.i18n.instant('patient.unnamed');
    if (!this.query()) {
      return this.recent.items().map((p) => ({
        value: p.id,
        label: p.fullName || unnamed,
        meta: p.fileNo,
        icon: 'history',
      }));
    }
    return this.results().items.map((item) => ({
      value: item.id,
      label: item.fullName || unnamed,
      meta: item.fileNo,
      supporting: item.mobile,
      // A typed number that is this patient's own: say which, and mark it.
      tag: item.match ? this.i18n.instant(MATCH_KEYS[item.match]) : null,
      icon: item.match ? 'task_alt' : 'person',
    }));
  });

  /** Names what an empty field is offering. */
  protected readonly heading = computed(() => {
    this.i18n.currentLang();
    return this.query() ? null : this.i18n.instant('globalSearch.recent');
  });

  /** Ctrl/Cmd+K focuses the search from anywhere, as staff expect. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.open();
    }
    if (event.key === 'Escape' && this.searchField()?.isFocused()) {
      this.searchField()?.clearAndBlur();
      this.expanded.set(false);
    }
  }

  /** Shows the field if it is folded away, and puts the caret in it. */
  protected open(): void {
    if (this.compact() && !this.expanded()) {
      this.expanded.set(true);
      // The field does not exist until the next render.
      afterNextRender(() => this.searchField()?.focus(), { injector: this.injector });
      return;
    }
    this.searchField()?.focus();
  }

  /**
   * Fold away again when focus leaves an empty field. Only an empty one:
   * with text in it the suggestion panel may be open, and its option is
   * chosen on a click that first blurs the input.
   */
  protected onFocusOut(): void {
    if (this.compact() && !this.control.value.trim()) this.expanded.set(false);
  }

  protected onSelect(patientId: string): void {
    this.control.setValue('');
    this.expanded.set(false);
    void this.router.navigate(['/patients', patientId]);
  }

  /**
   * Enter without picking a suggestion. A number that is exactly one
   * patient's file, national id or mobile opens that patient; anything else
   * — a name, a number a whole family shares — runs a full search. Enter can
   * beat the debounce, so the answer is fetched afresh unless the suggestions
   * on screen are for this very query.
   */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.control.value.trim();
    if (!q) return;
    const shown = this.results();
    const lookup =
      shown.q === q
        ? of(shown.items)
        : q.length < MIN_QUERY_LENGTH
          ? of<PatientSuggestion[]>([])
          : this.patients.suggest(q).pipe(catchError(() => of<PatientSuggestion[]>([])));
    lookup.subscribe((items) => {
      const exact = items.filter((item) => item.match);
      this.control.setValue('');
      this.expanded.set(false);
      if (exact.length === 1) void this.router.navigate(['/patients', exact[0].id]);
      else void this.router.navigate(['/patients'], { queryParams: { q } });
    });
  }

  /** "Nobody found" only once the answer for this very query is in, not while it is on its way. */
  protected displayEmpty(): boolean {
    const q = this.query();
    return q.length >= MIN_QUERY_LENGTH && this.results().q === q;
  }
}
