import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PersianNumberPipe } from '../../pipes/persian-number.pipe';
import { PbButton } from '../button/button';
import { chartQuadrants, jawTeeth, positionOf, toothName } from './teeth';

type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';

/**
 * The outline of each kind of tooth, drawn upright for the upper jaw — root
 * at the top, crown at the bottom, toward the bite — on a 40 × 60 box. The
 * lower jaw uses the same drawings flipped, so its crowns also face the bite.
 */
const SHAPES: Record<ToothKind, { crown: string; root: string; width: number }> = {
  incisor: {
    crown: 'M11 28 Q11 25 14 25 H26 Q29 25 29 28 L28.5 49 Q28 57 20 57.5 Q12 57 11.5 49 Z',
    root: 'M14.5 26 Q15 8 20 2 Q25 8 25.5 26 Z',
    width: 35,
  },
  canine: {
    crown: 'M10 28 Q10 25 13 25 H27 Q30 25 30 28 L29 47 Q26 56 20 59 Q14 56 11 47 Z',
    root: 'M14 26 Q14.5 4 20 0 Q25.5 4 26 26 Z',
    width: 38,
  },
  premolar: {
    crown:
      'M7 28 Q7 25 10 25 H30 Q33 25 33 28 L32.5 47 Q32 56 26.5 56 Q23.5 52.5 20 55.5 Q16.5 52.5 13.5 56 Q8 56 7.5 47 Z',
    root: 'M12 26 Q12.5 7 16.5 3 L20 13 L23.5 3 Q27.5 7 28 26 Z',
    width: 40,
  },
  molar: {
    crown:
      'M3.5 28 Q3.5 24.5 7.5 24.5 H32.5 Q36.5 24.5 36.5 28 L36 46 Q35.5 56 30 56 Q26.5 51.5 23 55.5 Q20 51.5 17 55.5 Q13.5 51.5 10 56 Q4.5 56 4 46 Z',
    root: 'M7.5 25.5 Q7 9 11 3 Q14.5 11 17 25.5 Z M23 25.5 Q25.5 11 29 3 Q33 9 32.5 25.5 Z',
    width: 50,
  },
};

function kindOf(position: number): ToothKind {
  if (position <= 2) return 'incisor';
  if (position === 3) return 'canine';
  if (position <= 5) return 'premolar';
  return 'molar';
}

interface ToothView {
  fdi: number;
  position: number;
  kind: ToothKind;
  crown: string;
  root: string;
  width: number;
  /** How far the tooth sits from the bite line, so each row bends like an arch. */
  lift: number;
  name: string;
}

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
    const [upperRight, upperLeft, lowerRight, lowerLeft] = chartQuadrants(this.i18n);
    const view = (fdi: number): ToothView => {
      const position = positionOf(fdi);
      const kind = kindOf(position);
      const shape = SHAPES[kind];
      return {
        fdi,
        position,
        kind,
        crown: shape.crown,
        root: shape.root,
        width: shape.width,
        lift: Math.round((position - 1) * (position - 1) * 0.7),
        name: toothName(fdi, this.i18n),
      };
    };
    return [
      {
        id: 'upper',
        label: 'tooth.upperJaw',
        teeth: [...upperRight.teeth, ...upperLeft.teeth].map(view),
      },
      {
        id: 'lower',
        label: 'tooth.lowerJaw',
        teeth: [...lowerRight.teeth, ...lowerLeft.teeth].map(view),
      },
    ];
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
