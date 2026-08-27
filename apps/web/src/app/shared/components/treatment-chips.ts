import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { treatmentColor } from '../labels';
import type { PatientTreatment } from '../../core/models/patient.model';

/**
 * The treatments a patient has had, as coloured chips.
 *
 * A patient can carry up to thirteen; showing all of them turns a table row
 * into three lines, so the list truncates and reports the remainder. The full
 * set is always on the detail page.
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
            [matTooltip]="t.nameFa">
            <mat-icon class="chip__icon" aria-hidden="true">{{ t.icon }}</mat-icon>
            @if (showLabels()) {
              <span class="chip__label">{{ t.nameFa }}</span>
            }
          </span>
        }
        @if (hidden() > 0) {
          <span class="chip chip--more" [matTooltip]="hiddenNames()">
            +{{ hidden() }}
          </span>
        }
      </span>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .empty { color: var(--mat-sys-on-surface-variant); }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 26px;
      padding-inline: 8px;
      border-radius: 999px;
      background: var(--chip-bg, var(--mat-sys-secondary-container));
      color: var(--chip-fg, var(--mat-sys-on-secondary-container));
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      cursor: default;
    }
    .chip__icon { font-size: 16px; width: 16px; height: 16px; }
    .chip--more {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class TreatmentChips {
  readonly treatments = input.required<PatientTreatment[]>();
  /** How many to render before collapsing the rest into a "+n" chip. */
  readonly max = input(4);
  readonly showLabels = input(false);

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
      // Persian separates list items with an Arabic comma, not a Latin one.
      .join($localize`:@@list.separator:، `);
  }
}
