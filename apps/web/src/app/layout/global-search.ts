import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap, tap } from 'rxjs';

import { PatientsService } from '../core/services/patients.service';
import type { PatientSuggestion } from '../core/models/patient.model';

/** Below this, a Persian query is too broad to be worth a round trip. */
const MIN_QUERY_LENGTH = 2;

@Component({
  selector: 'pb-global-search',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, MatProgressBarModule, MatIconModule],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
})
export class GlobalSearch {
  private readonly patients = inject(PatientsService);
  private readonly router = inject(Router);

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('searchInput');

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

  /** Ctrl/Cmd+K focuses the search from anywhere, as staff expect. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.input()?.nativeElement.focus();
    }
    if (event.key === 'Escape' && document.activeElement === this.input()?.nativeElement) {
      this.control.setValue('');
      this.input()?.nativeElement.blur();
    }
  }

  protected onSelect(event: MatAutocompleteSelectedEvent): void {
    const selected = event.option.value as PatientSuggestion;
    this.control.setValue('');
    void this.router.navigate(['/patients', selected.id]);
  }

  /** Enter without picking a suggestion runs a full search. */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.control.value.trim();
    if (!q) return;
    this.control.setValue('');
    void this.router.navigate(['/patients'], { queryParams: { q } });
  }

  protected displayEmpty(): string {
    return '';
  }
}
