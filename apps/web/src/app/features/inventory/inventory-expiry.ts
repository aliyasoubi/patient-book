import { Component, Pipe, type PipeTransform, inject, input } from '@angular/core';
import type { FormControl } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { JALALI_MONTH_KEYS } from '../../core/jalali/jalali-date-adapter';
import { formatPersianNumber } from '../../shared/pipes/persian-number.pipe';
import { PbTextField } from '../../shared/ui/text-field/text-field';
import { parseStockExpiry } from './stock-sheets';

const GREGORIAN_MONTH = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'gregory',
  month: 'long',
  timeZone: 'UTC',
});

/** Use the calendar and precision on the pack for display. */
export function formatInventoryExpiry(text: string, i18n: TranslateService): string | null {
  const parsed = parseStockExpiry(text);
  if (!parsed) return null;
  const { year, month, day, calendar } = parsed;
  if (month === undefined) return formatPersianNumber(year);

  const monthIndex = month - 1;
  const monthName =
    calendar === 'jalali'
      ? i18n.instant(JALALI_MONTH_KEYS[monthIndex])
      : GREGORIAN_MONTH.format(Date.UTC(year, monthIndex, 1));
  return formatPersianNumber(
    day === undefined ? `${monthName} ${year}` : `${day} ${monthName} ${year}`,
  );
}

@Pipe({ name: 'inventoryExpiry', standalone: true })
export class InventoryExpiryPipe implements PipeTransform {
  private readonly i18n = inject(TranslateService);

  transform(text: string | null, mode: 'display' | 'preview' = 'display'): string {
    if (!text) return '';
    const formatted = formatInventoryExpiry(text, this.i18n);
    return formatted ?? (mode === 'display' ? formatPersianNumber(text) : '');
  }
}

@Component({
  selector: 'pb-inventory-expiry-field',
  standalone: true,
  imports: [PbTextField, TranslatePipe, InventoryExpiryPipe],
  template: `
    <pb-text-field
      [control]="control()"
      [label]="label() ?? ('inventoryForm.expiry' | translate)"
      [placeholder]="'inventoryForm.expiryHint' | translate"
      [errorMessages]="errorMessages()"
      [maxlength]="20"
      [ltr]="true"
    />
    @if (control().value | inventoryExpiry: 'preview'; as preview) {
      <p class="expiry-preview">{{ preview }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-inline-size: 0;
    }

    .expiry-preview {
      margin: var(--pb-space-1) var(--pb-space-3) 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class InventoryExpiryField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input<string | null>(null);
  readonly errorMessages = input<Readonly<Record<string, string>>>({});
}
