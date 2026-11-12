import { Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { treatmentColor } from '../labels';
import type { PatientTreatment } from '../../core/models/common.model';
import { TranslateService } from '@ngx-translate/core';

/**
 * The treatments a patient has had, as labelled chips with a coloured icon.
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
      gap: var(--pb-space-1);
      align-items: center;
    }
    /* Calm by default: a white chip on a hairline, graphite text, and only
       the icon in the treatment's colour, so a row of several reads as a
       list rather than a row of coloured blocks. */
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding-inline: var(--pb-space-2) 10px;
      border: 1px solid var(--pb-neutral-200, var(--mat-sys-outline-variant));
      border-radius: 9px;
      background: var(--pb-surface);
      color: var(--pb-graphite, var(--mat-sys-on-surface));
      font-size: 0.8125rem;
      font-weight: 500;
      white-space: nowrap;
      cursor: default;
    }
    .chip__icon {
      inline-size: 16px;
      block-size: 16px;
      font-size: 16px;
      color: var(--chip-fg, var(--mat-sys-on-surface-variant));
      font-variation-settings: 'wght' 400;
    }
    .chip--more {
      padding-inline: var(--pb-space-2);
      border-color: transparent;
      background: var(--pb-neutral-100, var(--mat-sys-surface-container));
      color: var(--pb-neutral-600, var(--mat-sys-on-surface-variant));
      font-weight: 700;
      font-feature-settings: var(--pb-font-numeric);
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
