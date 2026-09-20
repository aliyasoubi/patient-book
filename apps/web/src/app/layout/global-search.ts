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
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
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
import type { PatientSuggestion } from '../features/patients/data/patient.model';
import { PbSearchField, type SearchFieldOption } from '../shared/ui';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

/** Below this, a Persian query is too broad to be worth a round trip. */
const MIN_QUERY_LENGTH = 2;

@Component({
  selector: 'pb-global-search',
  standalone: true,
  imports: [PbSearchField, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
})
export class GlobalSearch {
  private readonly patients = inject(PatientsService);
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

  /**
   * Suggestions for the type-ahead. Debounced so a fast typist issues one
   * request rather than one per keystroke, and `switchMap` so a slow earlier
   * response can never overwrite a newer one.
   */
  protected readonly suggestions = toSignal(
    this.control.valueChanges.pipe(
      startWith(''),
      debounceTime(220),
      map((value) => value.trim()),
      distinctUntilChanged(),
      tap((value) => this.loading.set(value.length >= MIN_QUERY_LENGTH)),
      switchMap((value) => {
        if (value.length < MIN_QUERY_LENGTH) {
          this.loading.set(false);
          return of<PatientSuggestion[]>([]);
        }
        return this.patients.suggest(value).pipe(
          tap(() => this.loading.set(false)),
          // A failed suggestion must not tear down the stream; the search box
          // has to keep working for the next keystroke.
          catchError(() => {
            this.loading.set(false);
            return of<PatientSuggestion[]>([]);
          }),
        );
      }),
    ),
    { initialValue: [] as PatientSuggestion[] },
  );

  protected readonly searchOptions = computed<SearchFieldOption[]>(() => {
    this.i18n.currentLang();
    return this.suggestions().map((item) => ({
      value: item.id,
      label: item.fullName || this.i18n.instant('patient.unnamed'),
      meta: item.fileNo,
      supporting: item.mobile,
      icon: 'person',
    }));
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

  /** Enter without picking a suggestion runs a full search. */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.control.value.trim();
    if (!q) return;
    this.control.setValue('');
    this.expanded.set(false);
    void this.router.navigate(['/patients'], { queryParams: { q } });
  }

  protected displayEmpty(): boolean {
    return this.control.value.trim().length >= MIN_QUERY_LENGTH;
  }
}
