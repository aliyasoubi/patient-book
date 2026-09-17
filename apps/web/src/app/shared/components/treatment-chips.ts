import { Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { treatmentColor } from '../labels';
import type { PatientTreatment } from '../../core/models/common.model';
import { TranslateService } from '@ngx-translate/core';

/**
 * The treatments a patient has had, as labelled, coloured chips.
 *
 * A patient can carry up to thirteen; showing all of them turns a table row
 * into three lines, so the list truncates and reports the remainder. The full
 * set is always on the detail page. Labels are on by default: the catalogue
 * icons (a diamond for a crown, a paint roller for a filling) are not
 * self-explanatory, and on a phone the tooltip that would explain them needs
 * a long-press nobody discovers.
 */
@Component({
  selector: 'pb-treatment-chips',
  standalone: true,
  imports: [MatTooltipModule, MatIconModule],
  template: `
    @if (treatments().length === 0) {
      <span class="empty">—</span>
    } @else {
      <span class="chips">
        @for (t of visible(); track t.id) {
          <span
            class="chip"
            [style.--chip-bg]="color(t.color).bg"
            [style.--chip-fg]="color(t.color).fg"
            [matTooltip]="showLabels() ? '' : t.nameFa"
          >
            <mat-icon class="chip__icon" aria-hidden="true">{{ t.icon }}</mat-icon>
            @if (showLabels()) {
              <span class="chip__label">{{ t.nameFa }}</span>
            }
          </span>
        }
        @if (hidden() > 0) {
          <span
            class="chip chip--more"
            [matTooltip]="hiddenNames()"
            [attr.aria-label]="hiddenNames()"
          >
            +{{ hidden() }}
          </span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    /* Sized like pb-status-chip (M3's 32dp, label-large) so the two chip
       kinds read as one family. */
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding-inline: 12px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--chip-bg, var(--mat-sys-secondary-container));
      color: var(--chip-fg, var(--mat-sys-on-secondary-container));
      font: var(--mat-sys-label-large);
      letter-spacing: var(--mat-sys-label-large-tracking);
      white-space: nowrap;
      cursor: default;
    }
    .chip__icon {
      font-size: 18px;
      width: 16px;
      height: 16px;
    }
    .chip--more {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class TreatmentChips {
  private readonly i18n = inject(TranslateService);
  readonly treatments = input.required<PatientTreatment[]>();
  /** How many to render before collapsing the rest into a "+n" chip. */
  readonly max = input(3);
  readonly showLabels = input(true);

  protected color = treatmentColor;

  protected visible(): PatientTreatment[] {
    return this.treatments().slice(0, this.max());
  }

  protected hidden(): number {
    return Math.max(0, this.treatments().length - this.max());
  }

  protected hiddenNames(): string {
    return this.treatments()
      .slice(this.max())
      .map((t) => t.nameFa)
      .join(this.i18n.instant('list.separator'));
  }
}
