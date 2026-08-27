import { Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';

import { RegistryService } from '../../core/services/registry.service';
import { AuthService } from '../../core/services/auth.service';
import { RegistryTable } from '../../shared/components/registry-table';
import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';
import { PbCheckboxField, PbSearchField } from '../../shared/ui';
import type { RegistryCase } from '../../core/models/common.model';

@Component({
  selector: 'pb-implant-list',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatPaginatorModule, MatProgressBarModule,
    RegistryTable, PersianCountPipe, PbSearchField, PbCheckboxField,
  ],
  templateUrl: './implant-list.html',
  styleUrl: './implant-list.scss',
})
export class ImplantList {
  private readonly registry = inject(RegistryService);
  protected readonly auth = inject(AuthService);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly page = signal(1);
  protected readonly limit = signal(25);
  protected readonly unlinkedOnly = signal(false);

  protected readonly loading = signal(false);
  protected readonly cases = signal<RegistryCase[]>([]);
  protected readonly total = signal(0);

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
      const page = this.page();
      const limit = this.limit();
      const unlinked = this.unlinkedOnly();
      untracked(() => this.fetch(q, page, limit, unlinked));
    });
  }

  private fetch(q: string, page: number, limit: number, unlinkedOnly: boolean): void {
    this.loading.set(true);
    this.registry
      .implants({ q: q || undefined, page, limit, unlinkedOnly: unlinkedOnly || undefined })
      .subscribe({
        next: (result) => {
          this.cases.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected readonly emptyTitle = $localize`:@@implant.emptyTitle:پرونده ایمپلنتی یافت نشد`;

  protected emptyHint(): string {
    return this.search.value
      ? $localize`:@@search.changeQuery:عبارت جستجو را تغییر دهید.`
      : '';
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
  }

  protected toggleUnlinked(checked: boolean): void {
    this.unlinkedOnly.set(checked);
    this.page.set(1);
  }
}
