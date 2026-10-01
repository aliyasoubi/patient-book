import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { type MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

export interface FilterChipOption {
  value: string;
  label: string;
  icon?: string;
  /** Resolve `label` as an i18n key. Dynamic API-provided labels leave this false. */
  translate?: boolean;
}

/**
 * M3 filter chips: the toggles above a list that narrow what it shows —
 * "unlinked only", "follow-up overdue", a set of treatments.
 *
 * `multiple` makes every chip independent; without it the chips are one
 * question with one answer, and tapping the selected chip clears it back to
 * "everything". Either way the selection travels as a list of values, so a
 * caller never has to care which mode Material's listbox reported in.
 *
 * The icon sits in the chip's leading (`matChipAvatar`) slot, so selecting
 * swaps it for M3's checkmark instead of stacking two glyphs at the front.
 */
@Component({
  selector: 'pb-filter-chips',
  standalone: true,
  imports: [MatChipsModule, MatIconModule, TranslatePipe],
  template: `
    <mat-chip-listbox
      [multiple]="multiple()"
      [attr.aria-label]="ariaLabel()"
      (change)="onChange($event)"
    >
      @for (option of options(); track option.value) {
        <mat-chip-option [value]="option.value" [selected]="isSelected(option.value)">
          @if (option.icon) {
            <mat-icon matChipAvatar aria-hidden="true">{{ option.icon }}</mat-icon>
          }
          {{ option.translate ? (option.label | translate) : option.label }}
        </mat-chip-option>
      }
    </mat-chip-listbox>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    mat-icon {
      font-size: var(--pb-icon-sm);
    }
  `,
})
export class PbFilterChips {
  readonly options = input.required<readonly FilterChipOption[]>();
  readonly selected = input<readonly string[]>([]);
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input.required<string>();
  readonly selectedChange = output<string[]>();

  private readonly selectedSet = computed(() => new Set(this.selected()));

  protected isSelected(value: string): boolean {
    return this.selectedSet().has(value);
  }

  protected onChange(event: MatChipListboxChange): void {
    const value: unknown = event.value;
    if (Array.isArray(value)) this.selectedChange.emit(value.map(String));
    else this.selectedChange.emit(value === undefined || value === null ? [] : [String(value)]);
  }
}
