import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { InventoryService, type InventoryItemInput } from '../../core/services/inventory.service';
import type {
  InventoryCategory,
  InventoryItem,
  InventoryItemDetail,
  InventoryUnit,
} from '../../core/models/common.model';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  inventoryCategoryLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import { toLatinDigits } from '../../shared/validators';
import {
  PbBanner,
  PbButton,
  PbFieldGrid,
  PbSelectField,
  PbTextField,
  PbTextareaField,
  type SelectOption,
  type TextFieldOption,
} from '../../shared/ui';
import { showOnFields } from './inventory-errors';

export interface InventoryItemDialogData {
  /** The item being corrected; absent when adding one. */
  item?: InventoryItem;
  /** Another size or shade of this item: everything but those is carried over. */
  template?: InventoryItem;
  /** The category a new item starts in — the one the list is showing. */
  category?: InventoryCategory;
}

/** What closing tells the list: the saved item, or that someone else got there first. */
export type InventoryItemDialogResult = InventoryItemDetail | 'conflict' | undefined;

/** A product already on the shelves, offered as the name is typed. */
interface Known {
  category: InventoryCategory;
  name: string;
  brand: string | null;
  unit: InventoryUnit;
  minQuantity: number | null;
}

/** Whole counts only, in either digit script. */
function count(control: AbstractControl<string>): ValidationErrors | null {
  const raw = toLatinDigits(control.value ?? '').trim();
  return !raw || /^\d{1,6}$/.test(raw) ? null : { pattern: true };
}

const countValue = (raw: string): number | null => {
  const value = toLatinDigits(raw).trim();
  return value ? Number(value) : null;
};
const blank = (raw: string): string | null => raw.trim() || null;
/** Typed text as compared: digits, Arabic letters and case all one way. */
const fold = (s: string): string =>
  toLatinDigits(s)
    .replace(/\u064a/g, String.fromCharCode(0x06cc)) // Arabic yeh → Persian yeh
    .replace(/\u0643/g, String.fromCharCode(0x06a9)) // Arabic kaf → keheh
    .trim()
    .toLowerCase();

/** The fewest suggestions that still find a product in a long list. */
const MAX_SUGGESTIONS = 8;

/**
 * Add an item, or correct one. Saves itself, so a refused save lands on the
 * field it is about.
 *
 * Most of a new item is already known: picking a product the clinic stocks
 * from the name's suggestions fills its category, brand, unit and minimum,
 * leaving the size or shade — usually all that is new. An item's quantity is
 * asked for once, when it is added, as its first count; after that only a
 * movement changes it.
 */
@Component({
  selector: 'pb-inventory-item-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    TranslatePipe,
    PbBanner,
    PbButton,
    PbFieldGrid,
    PbSelectField,
    PbTextField,
    PbTextareaField,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>
        {{ (item ? 'inventoryForm.editTitle' : 'inventoryForm.createTitle') | translate }}
      </h2>
      <mat-dialog-content class="form">
        @if (formError(); as message) {
          <pb-banner tone="error" size="compact" icon="error" role="alert">{{ message }}</pb-banner>
        }
        <pb-field-grid>
          <pb-text-field
            [control]="form.controls.name"
            [label]="'inventoryForm.name' | translate"
            [hint]="'inventoryForm.nameHint' | translate"
            [options]="nameOptions()"
            (optionSelected)="pickKnown($event)"
            [maxlength]="120"
          />
          <pb-text-field
            [control]="form.controls.brand"
            [label]="'inventoryForm.brand' | translate"
            [options]="brandOptions()"
            [maxlength]="80"
          />
          <pb-text-field
            class="item-form__spec"
            [control]="form.controls.spec"
            [label]="'inventoryForm.spec' | translate"
            [hint]="'inventoryForm.specHint' | translate"
            [options]="specOptions()"
            [maxlength]="120"
          />
          <pb-select-field
            [control]="form.controls.category"
            [options]="categoryOptions"
            [label]="'inventoryForm.category' | translate"
          />
          @if (!item) {
            <pb-text-field
              [control]="form.controls.quantity"
              [label]="'inventoryForm.quantity' | translate"
              [hint]="'inventoryForm.quantityHint' | translate"
              inputmode="numeric"
              [ltr]="true"
            />
          }
          <pb-select-field
            [control]="form.controls.unit"
            [options]="unitOptions"
            [label]="'inventoryForm.unit' | translate"
          />
          <pb-text-field
            [control]="form.controls.minQuantity"
            [label]="'inventoryForm.minQuantity' | translate"
            [hint]="'inventoryForm.minQuantityHint' | translate"
            inputmode="numeric"
            [ltr]="true"
          />
          <!-- The stock counted now is the item's first batch; after that
               each delivery brings its own lot and expiry. -->
          @if (!item) {
            <pb-text-field
              [control]="form.controls.expiry"
              [label]="'inventoryForm.expiry' | translate"
              [hint]="'inventoryForm.expiryHint' | translate"
              [maxlength]="20"
              [ltr]="true"
            />
            <pb-text-field
              [control]="form.controls.lotNumber"
              [label]="'inventoryMove.lotNumber' | translate"
              [maxlength]="60"
              [ltr]="true"
            />
          }
          <pb-textarea-field
            class="pb-field-grid__full"
            [control]="form.controls.notes"
            [label]="'inventoryForm.notes' | translate"
            [maxlength]="2000"
            [rows]="2"
          />
        </pb-field-grid>
        @if (item) {
          <p class="form__note">{{ 'inventoryForm.quantityNote' | translate }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <pb-button variant="text" type="button" (click)="ref.close()" [disabled]="saving()">
          {{ 'action.cancel' | translate }}
        </pb-button>
        <pb-button
          variant="text"
          type="submit"
          icon="save"
          [loading]="saving()"
          [loadingText]="'common.saving' | translate"
        >
          {{ 'inventoryForm.save' | translate }}
        </pb-button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-3);
      width: min(680px, 88vw);
    }
    .form__note {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class InventoryItemDialog {
  protected readonly ref =
    inject<MatDialogRef<InventoryItemDialog, InventoryItemDialogResult>>(MatDialogRef);
  private readonly data = inject<InventoryItemDialogData>(MAT_DIALOG_DATA);
  private readonly inventory = inject(InventoryService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly fb = inject(FormBuilder);

  protected readonly item = this.data.item ?? null;
  /** What the form starts from: the item itself, or the one it is like. */
  private readonly base = this.data.item ?? this.data.template ?? null;
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly categoryOptions: SelectOption[] = INVENTORY_CATEGORIES.map((c) => ({
    value: c,
    label: inventoryCategoryLabel(c),
    translate: true,
  }));
  protected readonly unitOptions: SelectOption[] = INVENTORY_UNITS.map((u) => ({
    value: u,
    label: inventoryUnitLabel(u),
    translate: true,
  }));

  protected readonly form = this.fb.nonNullable.group({
    name: [this.base?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    brand: [this.base?.brand ?? '', Validators.maxLength(80)],
    // A similar item differs in exactly this, so it starts empty.
    spec: [this.item?.spec ?? '', Validators.maxLength(120)],
    category: [
      (this.base?.category ?? this.data.category ?? 'other') as string,
      Validators.required,
    ],
    unit: [(this.base?.unit ?? 'piece') as string, Validators.required],
    quantity: ['', count],
    minQuantity: [this.base?.minQuantity != null ? String(this.base.minQuantity) : '', count],
    expiry: ['', Validators.maxLength(20)],
    lotNumber: ['', Validators.maxLength(60)],
    notes: [this.item?.notes ?? '', Validators.maxLength(2000)],
  });

  /** Everything on the shelves, for the suggestions. */
  private readonly stock = signal<InventoryItem[]>([]);
  /** One of each product the clinic stocks, for the name suggestions. */
  private readonly known = computed(() => distinctProducts(this.stock()));
  /** The catalogue's brands, as it spells them, and those already in stock. */
  private readonly brands = signal<{ name: string; spellings: string[] }[]>([]);

  private readonly nameTyped = toSignal(this.form.controls.name.valueChanges, {
    initialValue: this.form.controls.name.value,
  });
  private readonly brandTyped = toSignal(this.form.controls.brand.valueChanges, {
    initialValue: this.form.controls.brand.value,
  });
  private readonly specTyped = toSignal(this.form.controls.spec.valueChanges, {
    initialValue: this.form.controls.spec.value,
  });

  /** «Supe Line (Dentium)»: picking one fills in the rest of what is known about it. */
  protected readonly nameOptions = computed<TextFieldOption[]>(() => {
    const typed = fold(this.nameTyped());
    return this.known()
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => !typed || fold(k.name).includes(typed))
      .slice(0, MAX_SUGGESTIONS)
      .map(({ k, i }) => ({
        value: k.name,
        label: k.name,
        id: String(i),
        meta: k.brand ?? undefined,
      }));
  });

  /**
   * Brands as the catalogue spells them, so a new item names its maker the
   * way every other item does — the API stores that spelling anyway.
   */
  protected readonly brandOptions = computed<TextFieldOption[]>(() => {
    const typed = fold(this.brandTyped());
    return this.brands()
      .filter((b) => !typed || [b.name, ...b.spellings].some((x) => fold(x).includes(typed)))
      .slice(0, MAX_SUGGESTIONS)
      .map((b) => ({ value: b.name, label: b.name }));
  });

  /**
   * The sizes or shades this product already comes in — what a new one is
   * written like, and which are taken.
   */
  protected readonly specOptions = computed<TextFieldOption[]>(() => {
    const name = fold(this.nameTyped());
    const brand = fold(this.brandTyped());
    const typed = fold(this.specTyped());
    if (!name) return [];
    const specs = this.stock()
      .filter((i) => fold(i.name) === name && fold(i.brand ?? '') === brand && i.spec)
      .map((i) => i.spec!);
    return [...new Set(specs)]
      .filter((spec) => !typed || fold(spec).includes(typed))
      .slice(0, MAX_SUGGESTIONS)
      .map((spec) => ({ value: spec, label: spec }));
  });

  constructor() {
    // Suggestions are a convenience: without them the form still works.
    this.inventory.list({}).subscribe({
      next: (items) => this.stock.set(items),
      error: () => this.stock.set([]),
    });
    this.inventory.brands().subscribe({
      next: (brands) => this.brands.set(brands),
      error: () => this.brands.set([]),
    });
  }

  /** A product the clinic already stocks: take its category, brand, unit and minimum. */
  protected pickKnown(option: TextFieldOption): void {
    const known = this.known()[Number(option.id)];
    if (!known || this.item) return;
    this.form.patchValue({
      category: known.category,
      brand: known.brand ?? '',
      unit: known.unit,
      minQuantity: known.minQuantity !== null ? String(known.minQuantity) : '',
    });
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body: InventoryItemInput = {
      category: raw.category as InventoryCategory,
      name: raw.name.trim(),
      brand: blank(raw.brand),
      spec: blank(raw.spec),
      unit: raw.unit as InventoryUnit,
      minQuantity: countValue(raw.minQuantity),
      notes: blank(raw.notes),
    };
    this.saving.set(true);
    this.formError.set(null);
    const request = this.item
      ? this.inventory.update(this.item.id, { ...body, expectedVersion: this.item.version })
      : this.inventory.create({
          ...body,
          quantity: countValue(raw.quantity) ?? 0,
          expiry: blank(toLatinDigits(raw.expiry)),
          lotNumber: blank(raw.lotNumber),
        });
    request.subscribe({
      next: (saved) => this.ref.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        // Edited or moved meanwhile: the list reloads and says so.
        if (
          error instanceof HttpErrorResponse &&
          (error.error as { code?: string } | null)?.code === 'ERR_INVENTORY_ITEM_MODIFIED'
        ) {
          this.ref.close('conflict');
          return;
        }
        this.formError.set(
          showOnFields(error, this.errors, this.form.controls, {
            ERR_INVENTORY_ITEM_EXISTS: 'spec',
          }),
        );
      },
    });
  }
}

/** One entry per product line — its sizes and shades share everything offered here. */
function distinctProducts(items: readonly InventoryItem[]): Known[] {
  const seen = new Map<string, Known>();
  for (const i of items) {
    const key = `${i.category}|${fold(i.name)}|${fold(i.brand ?? '')}`;
    if (!seen.has(key)) {
      seen.set(key, {
        category: i.category,
        name: i.name,
        brand: i.brand,
        unit: i.unit,
        minQuantity: i.minQuantity,
      });
    }
  }
  return [...seen.values()];
}
