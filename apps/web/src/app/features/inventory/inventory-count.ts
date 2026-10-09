import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormControl,
  FormGroup,
  FormRecord,
  ReactiveFormsModule,
  type ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { type HasUnsavedChanges, warnBeforeUnload } from '../../core/guards/unsaved-changes.guard';
import { InventoryService } from '../../core/services/inventory.service';
import type { InventoryCategory, InventoryItem } from '../../core/models/common.model';
import { ConfirmDialog, type ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_ICONS,
  inventoryCategoryLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import { toLatinDigits } from '../../shared/validators';
import {
  PbButton,
  PbPage,
  PbPageHeader,
  PbSelectField,
  PbStatusChip,
  PbTextField,
  type SelectOption,
} from '../../shared/ui';
import { changedLines, type CountRow } from './stock-sheets';

type RowGroup = FormGroup<{ counted: FormControl<string>; min: FormControl<string> }>;

/** A whole number, or nothing — a count left blank was not counted. */
function wholeOrBlank(control: AbstractControl<string>): ValidationErrors | null {
  const raw = toLatinDigits(control.value ?? '').trim();
  return !raw || /^\d{1,6}$/.test(raw) ? null : { pattern: true };
}

const isCategory = (value: unknown): value is InventoryCategory =>
  INVENTORY_CATEGORIES.includes(value as InventoryCategory);

/**
 * A stocktake, one shelf at a time: each item's count as recorded, a field
 * for what is on the shelf, and its reorder level beside it — the moment
 * someone is looking at the shelf is when that level is best judged. Only
 * what differs is sent, and the whole sheet is saved at once or not at all.
 */
@Component({
  selector: 'pb-inventory-count',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
    EmptyState,
    LoadError,
    PersianNumberPipe,
    PbButton,
    PbPage,
    PbPageHeader,
    PbSelectField,
    PbStatusChip,
    PbTextField,
  ],
  templateUrl: './inventory-count.html',
  styleUrl: './inventory-count.scss',
})
export class InventoryCount implements HasUnsavedChanges {
  private readonly inventory = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(TranslateService);
  private readonly errors = inject(ApiErrorTranslator);

  protected readonly categoryIcons = INVENTORY_CATEGORY_ICONS;
  protected readonly categoryLabel = inventoryCategoryLabel;
  protected readonly unitLabel = inventoryUnitLabel;
  protected readonly categoryOptions: SelectOption[] = INVENTORY_CATEGORIES.map((c) => ({
    value: c,
    label: inventoryCategoryLabel(c),
    translate: true,
  }));

  private readonly fromUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('category');
  protected readonly category = signal<InventoryCategory>(
    isCategory(this.fromUrl) ? this.fromUrl : 'implant',
  );
  protected readonly categoryControl = new FormControl<string>(this.category(), {
    nonNullable: true,
  });
  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = new FormRecord<RowGroup>({});
  private readonly values = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue() as Record<string, CountRow>),
    ),
    { initialValue: {} as Record<string, CountRow> },
  );
  /** What the sheet would send: the rows that differ from the record. */
  protected readonly changes = computed(() => changedLines(this.items(), this.values()));
  protected readonly changedIds = computed(() => new Set(this.changes().map((l) => l.id)));
  protected readonly saveLabel = computed(() => {
    this.i18n.currentLang();
    const n = this.changes().length;
    return n
      ? this.i18n.instant('inventoryCount.saveCount', { count: formatPersianCount(n) })
      : this.i18n.instant('inventoryCount.save');
  });

  constructor() {
    warnBeforeUnload(() => this.hasUnsavedChanges());
    this.categoryControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.setCategory(value));
    this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.changes().length > 0 && !this.saving();
  }

  protected back(): void {
    void this.router.navigate(['/inventory']);
  }

  /** Another shelf — after asking, if this one has counts not yet saved. */
  private setCategory(value: string): void {
    if (!isCategory(value) || value === this.category()) return;
    const go = () => {
      this.category.set(value);
      this.load();
    };
    if (!this.hasUnsavedChanges()) return go();
    const data: ConfirmData = {
      title: this.i18n.instant('unsaved.title'),
      message: this.i18n.instant('unsaved.message'),
      confirmLabel: this.i18n.instant('unsaved.leave'),
      cancelLabel: this.i18n.instant('unsaved.stay'),
      tone: 'warn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((leave) =>
        leave ? go() : this.categoryControl.setValue(this.category(), { emitEvent: false }),
      );
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.inventory.list({ category: this.category() }).subscribe({
      next: (items) => {
        for (const id of Object.keys(this.form.controls)) this.form.removeControl(id);
        for (const item of items) {
          this.form.addControl(
            item.id,
            new FormGroup({
              counted: new FormControl(String(item.quantity), {
                nonNullable: true,
                validators: wholeOrBlank,
              }),
              min: new FormControl(item.minQuantity !== null ? String(item.minQuantity) : '', {
                nonNullable: true,
                validators: wholeOrBlank,
              }),
            }),
          );
        }
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  protected row(id: string): RowGroup {
    return this.form.controls[id];
  }

  /** `+3`, `−2`: what the shelf has against the record, read left to right. */
  protected difference(item: InventoryItem): string | null {
    const raw = toLatinDigits(this.values()[item.id]?.counted ?? '').trim();
    if (!/^\d+$/.test(raw)) return null;
    const diff = Number(raw) - item.quantity;
    return diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : null;
  }

  protected save(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const lines = this.changes();
    if (!lines.length) return;
    this.saving.set(true);
    this.inventory.count(lines).subscribe({
      next: ({ counted, minimums }) => {
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.instant('inventoryCount.saved', {
            counted: formatPersianCount(counted),
            minimums: formatPersianCount(minimums),
          }),
          this.i18n.instant('action.dismiss'),
        );
        this.load();
      },
      // Nothing was saved: the sheet stays as typed, to try again.
      error: (error: unknown) => {
        this.saving.set(false);
        this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
          duration: 6000,
        });
      },
    });
  }
}
