import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { PbButton } from '../../shared/ui';
import {
  QUADRANT_LABELS,
  type Quadrant,
  TOOTH_RANGE,
  jawTeeth,
  positionOf,
  quadrantOf,
} from './lab-teeth';

interface QuadrantView {
  id: Quadrant;
  label: string;
  /** FDI numbers in the order they sit on screen. */
  teeth: number[];
}

/**
 * The teeth a piece of lab work is for, picked on a chart.
 *
 * Laid out as the dentist sees the mouth: the patient's right is on the
 * viewer's left, the upper jaw above the lower, each quadrant counting out
 * from the midline. The chart is physically left-to-right whatever the page
 * direction — flipping it would put the patient's right on the wrong side.
 * Selected teeth travel as FDI numbers, sorted.
 */
@Component({
  selector: 'pb-lab-tooth-picker',
  standalone: true,
  imports: [TranslatePipe, PersianNumberPipe, PbButton],
  template: `
    <div
      class="chart"
      role="group"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-invalid]="invalid() || null"
    >
      <div class="chart__arches" dir="ltr">
        @for (quadrant of quadrants(); track quadrant.id) {
          <div class="chart__quadrant" role="group" [attr.aria-label]="quadrant.label">
            <span class="chart__caption">{{ quadrant.label }}</span>
            <div class="chart__teeth">
              @for (tooth of quadrant.teeth; track tooth) {
                <button
                  type="button"
                  class="chart__tooth"
                  [class.chart__tooth--on]="isSelected(tooth)"
                  [attr.aria-pressed]="isSelected(tooth)"
                  [attr.aria-label]="toothLabel(tooth)"
                  (click)="toggle(tooth)"
                >
                  {{ position(tooth) | faNum }}
                </button>
              }
            </div>
          </div>
        }
      </div>

      <div class="chart__shortcuts">
        <pb-button variant="text" (click)="toggleJaw('upper')">{{
          'labTooth.wholeUpper' | translate
        }}</pb-button>
        <pb-button variant="text" (click)="toggleJaw('lower')">{{
          'labTooth.wholeLower' | translate
        }}</pb-button>
        <pb-button variant="text" [disabled]="!selected().length" (click)="clear()">{{
          'labTooth.clear' | translate
        }}</pb-button>
      </div>
    </div>
  `,
  styleUrl: './lab-tooth-picker.scss',
})
export class LabToothPicker {
  private readonly i18n = inject(TranslateService);

  readonly selected = input<readonly number[]>([]);
  readonly ariaLabel = input.required<string>();
  readonly invalid = input(false);
  readonly selectedChange = output<number[]>();

  protected readonly position = positionOf;

  /** Upper right, upper left, lower right, lower left — rows of the chart. */
  protected readonly quadrants = computed<QuadrantView[]>(() => {
    this.i18n.currentLang();
    const view = (id: Quadrant): QuadrantView => {
      // Quadrants on the viewer's left count outward to the left: 7…1 | 1…7.
      const fromMidline = TOOTH_RANGE.map((n) => id * 10 + n);
      const onViewersLeft = id === 1 || id === 4;
      return {
        id,
        label: this.i18n.instant(QUADRANT_LABELS[id]),
        teeth: onViewersLeft ? fromMidline.reverse() : fromMidline,
      };
    };
    return ([1, 2, 4, 3] as const).map(view);
  });

  protected isSelected(tooth: number): boolean {
    return this.selected().includes(tooth);
  }

  protected toothLabel(tooth: number): string {
    return `${positionOf(tooth)} ${this.i18n.instant(QUADRANT_LABELS[quadrantOf(tooth)])}`;
  }

  protected toggle(tooth: number): void {
    this.emit(
      this.isSelected(tooth)
        ? this.selected().filter((t) => t !== tooth)
        : [...this.selected(), tooth],
    );
  }

  /** The whole jaw; once every tooth of it is chosen, the same button lets it go. */
  protected toggleJaw(jaw: 'upper' | 'lower'): void {
    const teeth = jawTeeth(jaw);
    const chosen = this.selected();
    this.emit(
      teeth.every((t) => chosen.includes(t))
        ? chosen.filter((t) => !teeth.includes(t))
        : [...chosen, ...teeth.filter((t) => !chosen.includes(t))],
    );
  }

  protected clear(): void {
    this.emit([]);
  }

  private emit(teeth: number[]): void {
    this.selectedChange.emit([...teeth].sort((a, b) => a - b));
  }
}
