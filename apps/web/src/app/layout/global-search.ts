import { Component, HostListener, computed, inject, signal, viewChild } from '@angular/core';
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

import { PatientsService } from '../core/services/patients.service';
import type { PatientSuggestion } from '../core/models/patient.model';
import { PbSearchField, type SearchFieldOption } from '../shared/ui';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

/** Below this, a Persian query is too broad to be worth a round trip. */
const MIN_QUERY_LENGTH = 2;

@Component({
  selector: 'pb-global-search',
  standalone: true,
  imports: [PbSearchField, TranslatePipe],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
})
export class GlobalSearch {
  private readonly patients = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);

  private readonly searchField = viewChild<PbSearchField>('searchField');

  protected readonly control = new FormControl('', { nonNullable: true });
  protected readonly loading = signal(false);

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
      this.searchField()?.focus();
    }
    if (event.key === 'Escape' && this.searchField()?.isFocused()) {
      this.searchField()?.clearAndBlur();
    }
  }

  protected onSelect(patientId: string): void {
    this.control.setValue('');
    void this.router.navigate(['/patients', patientId]);
  }

  /** Enter without picking a suggestion runs a full search. */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.control.value.trim();
    if (!q) return;
    this.control.setValue('');
    void this.router.navigate(['/patients'], { queryParams: { q } });
  }

  protected displayEmpty(): boolean {
    return this.control.value.trim().length >= MIN_QUERY_LENGTH;
  }
}
