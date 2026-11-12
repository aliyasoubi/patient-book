import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PersianNumberPipe } from '../../pipes/persian-number.pipe';
import { PbButton } from '../button/button';
import { jawTeeth } from './teeth';
import { mouthView } from './tooth-shapes';

/**
 * The teeth a piece of work is for, picked on a chart that looks like the
 * mouth — not a grid of numbers. Each tooth is drawn as its kind (incisor,
 * canine, premolar, molar), crown toward the bite and root away from it, the
 * two rows bending like the arches. The patient's right is on the viewer's
 * left, as the dentist faces them; the midline and the bite are marked.
 * A picked tooth fills with the accent; hovering one names it.
 *
 * Selected teeth travel as FDI numbers, sorted. `single` holds it to one
 * tooth (an implant from the stock goes into one): a tap picks that tooth in
 * place of the last, and the whole-jaw shortcuts are not offered.
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
      <div class="chart__mouth" dir="ltr">
        <span class="chart__side chart__side--right">{{ 'tooth.patientRight' | translate }}</span>
        <span class="chart__side chart__side--left">{{ 'tooth.patientLeft' | translate }}</span>

        @for (jaw of jaws(); track jaw.id) {
          <div class="chart__jaw" [attr.data-jaw]="jaw.id">
            <span class="chart__jaw-label">{{ jaw.label | translate }}</span>
            <div class="chart__row" role="group" [attr.aria-label]="jaw.label | translate">
              @for (tooth of jaw.teeth; track tooth.fdi; let i = $index) {
                <button
                  type="button"
                  class="chart__tooth"
                  [class.chart__tooth--on]="isSelected(tooth.fdi)"
                  [class.is-midline]="i === 7"
                  [attr.data-kind]="tooth.kind"
                  [attr.aria-pressed]="isSelected(tooth.fdi)"
                  [attr.aria-label]="tooth.name"
                  [title]="tooth.name"
                  [style.--_lift.px]="tooth.lift"
                  (click)="toggle(tooth.fdi)"
                >
                  <svg
                    class="chart__shape"
                    viewBox="0 0 40 60"
                    preserveAspectRatio="none"
                    [attr.width]="tooth.width"
                    aria-hidden="true"
                  >
                    <path class="chart__root" [attr.d]="tooth.root" />
                    <path class="chart__crown" [attr.d]="tooth.crown" />
                  </svg>
                  <span class="chart__num">{{ tooth.position | faNum }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>

      <div class="chart__foot">
        <span class="chart__count">
          @if (selected().length) {
            {{ 'tooth.selectedCount' | translate: { count: (selected().length | faNum) } }}
          } @else {
            {{ 'tooth.pickHint' | translate }}
          }
        </span>
        <div class="chart__shortcuts">
          @if (!single()) {
            <pb-button variant="text" tone="neutral" (click)="toggleJaw('upper')">{{
              'tooth.wholeUpper' | translate
            }}</pb-button>
            <pb-button variant="text" tone="neutral" (click)="toggleJaw('lower')">{{
              'tooth.wholeLower' | translate
            }}</pb-button>
          }
          <pb-button
            variant="text"
            tone="neutral"
            [disabled]="!selected().length"
            (click)="clear()"
            >{{ 'tooth.clear' | translate }}</pb-button
          >
        </div>
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

  /** The upper and the lower row, each the patient's right then their left. */
  protected readonly jaws = computed(() => {
    this.i18n.currentLang();
    return mouthView(this.i18n);
  });

  protected isSelected(tooth: number): boolean {
    return this.selected().includes(tooth);
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
