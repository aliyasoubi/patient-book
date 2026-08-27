import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';

import { RegistryService } from '../../core/services/registry.service';
import { AuthService } from '../../core/services/auth.service';
import { EmptyState } from '../../shared/components/empty-state';
import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { abutmentLabel, surgeryStatusLabel } from '../../shared/labels';
import { PbCheckboxField, PbSearchField } from '../../shared/ui';
import type { SurgeryQueueItem } from '../../core/models/common.model';

@Component({
  selector: 'pb-surgery-list',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink,
    MatButtonToggleModule, MatPaginatorModule,
    MatProgressBarModule, EmptyState, PersianCountPipe, PersianNumberPipe,
    PbSearchField, PbCheckboxField, MatIconModule],
  templateUrl: './surgery-list.html',
  styleUrl: './surgery-list.scss',
})
export class SurgeryList {
  private readonly registry = inject(RegistryService);
  protected readonly auth = inject(AuthService);

  protected readonly abutmentLabel = abutmentLabel;
  protected readonly statusLabel = surgeryStatusLabel;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = signal<'' | 'scheduled' | 'completed' | 'cancelled'>('');
  protected readonly mismatchedOnly = signal(false);
  protected readonly page = signal(1);
  protected readonly limit = signal(25);

  protected readonly loading = signal(false);
  protected readonly items = signal<SurgeryQueueItem[]>([]);
  protected readonly total = signal(0);

  /** Rows whose register number has been reused for someone else. */
  protected readonly mismatchCount = computed(
    () => this.items().filter((i) => i.hasNameMismatch).length,
  );

  private readonly query = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  constructor() {
    effect(() => {
      const q = this.query();
      const status = this.status();
      const mismatched = this.mismatchedOnly();
      const page = this.page();
      const limit = this.limit();
      untracked(() => this.fetch(q, status, mismatched, page, limit));
    });
  }

  private fetch(
    q: string,
    status: string,
    mismatchedOnly: boolean,
    page: number,
    limit: number,
  ): void {
    this.loading.set(true);
    this.registry
      .surgeryQueue({
        q: q || undefined,
        status: status || undefined,
        mismatchedOnly: mismatchedOnly || undefined,
        page,
        limit,
        sortDir: 'ASC',
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected readonly unnamed = $localize`:@@patient.unnamed:بدون نام`;

  protected callLabel(name: string): string {
    return $localize`:@@action.callPerson:تماس با ${name}:name:`;
  }

  protected readonly emptyTitle = $localize`:@@surgery.emptyTitle:ردیفی در لیست جراحی نیست`;

  protected emptyHint(): string {
    return this.search.value || this.status()
      ? $localize`:@@filters.changeThem:فیلترها را تغییر دهید.`
      : '';
  }

  protected setStatus(value: '' | 'scheduled' | 'completed' | 'cancelled'): void {
    this.status.set(value);
    this.page.set(1);
  }

  protected toggleMismatched(checked: boolean): void {
    this.mismatchedOnly.set(checked);
    this.page.set(1);
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
  }
}
