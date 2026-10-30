import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PersianNumberPipe } from '../../pipes/persian-number.pipe';
import { PbButton } from '../button/button';
import { type QuadrantView, chartQuadrants, jawTeeth, positionOf, toothName } from './teeth';

/**
 * The teeth a piece of work is for, picked on a chart — lab work, a surgery.
 *
 * Laid out as the dentist sees the mouth: the patient's right is on the
 * viewer's left, the upper jaw above the lower, each quadrant counting out
 * from the midline. The chart is physically left-to-right whatever the page
 * direction — flipping it would put the patient's right on the wrong side.
 * Selected teeth travel as FDI numbers, sorted.
 *
 * `single` holds it to one tooth — an implant from the stock goes into one:
 * a tap picks that tooth instead of adding it, and the whole-jaw shortcuts
 * are not offered.
 */
@Component({
  selector: 'pb-tooth-picker',
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
        @if (!single()) {
          <pb-button variant="text" (click)="toggleJaw('upper')">{{
            'tooth.wholeUpper' | translate
          }}</pb-button>
          <pb-button variant="text" (click)="toggleJaw('lower')">{{
            'tooth.wholeLower' | translate
          }}</pb-button>
        }
        <pb-button variant="text" [disabled]="!selected().length" (click)="clear()">{{
          'tooth.clear' | translate
        }}</pb-button>
      </div>
    </div>
  `,
  styleUrl: './tooth-picker.scss',
})
export class PbToothPicker {
  private readonly i18n = inject(TranslateService);

  readonly selected = input<readonly number[]>([]);
  readonly ariaLabel = input.required<string>();
  readonly invalid = input(false);
  /** One tooth at most: a tap picks it in place of whatever was picked. */
  readonly single = input(false);
  readonly selectedChange = output<number[]>();

  protected readonly position = positionOf;

  /** Upper right, upper left, lower right, lower left — rows of the chart. */
  protected readonly quadrants = computed<QuadrantView[]>(() => {
    this.i18n.currentLang();
    return chartQuadrants(this.i18n);
  });

  protected isSelected(tooth: number): boolean {
    return this.selected().includes(tooth);
  }

  protected toothLabel(tooth: number): string {
    return toothName(tooth, this.i18n);
  }

  protected toggle(tooth: number): void {
    if (this.isSelected(tooth)) {
      this.emit(this.selected().filter((t) => t !== tooth));
    } else {
      this.emit(this.single() ? [tooth] : [...this.selected(), tooth]);
    }
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
