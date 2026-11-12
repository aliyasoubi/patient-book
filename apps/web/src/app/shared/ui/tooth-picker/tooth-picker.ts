import { MatTooltipModule } from '@angular/material/tooltip';
import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PersianNumberPipe } from '../../pipes/persian-number.pipe';
import { PbButton } from '../button/button';
import { PbIcon } from '../icon/icon';
import { jawShortcutTeeth } from './teeth';
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
  imports: [MatTooltipModule, TranslatePipe, PersianNumberPipe, PbButton, PbIcon],
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
                  [class.chart__tooth--wisdom]="tooth.wisdom"
                  [class.is-midline]="i === jaw.teeth.length / 2"
                  [attr.data-fdi]="tooth.fdi"
                  [attr.data-kind]="tooth.kind"
                  [attr.aria-pressed]="isSelected(tooth.fdi)"
                  [attr.aria-label]="tooth.name"
                  [matTooltip]="tooth.name"
                  [style.--_lift.px]="tooth.lift"
                  [style.--_tilt.deg]="tooth.tilt"
                  (click)="toggle(tooth.fdi)"
                >
                  <svg
                    class="chart__shape"
                    viewBox="0 0 40 64"
                    preserveAspectRatio="none"
                    [attr.width]="tooth.width"
                    aria-hidden="true"
                  >
                    <path class="chart__root" [attr.d]="tooth.root" />
                    <path class="chart__pulp" [attr.d]="tooth.pulp" />
                    <path class="chart__crown" [attr.d]="tooth.crown" />
                    <path class="chart__shade" [attr.d]="tooth.shade" />
                    <path class="chart__edge" [attr.d]="tooth.edge || null" />
                    <path class="chart__detail" [attr.d]="tooth.detail" />
                  </svg>
                  <span class="chart__num">
                    {{ tooth.position | faNum }}
                    @if (tooth.wisdom) {
                      <span class="chart__wisdom-label">{{ 'tooth.wisdom' | translate }}</span>
                    }
                  </span>
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
            <!-- The shortcuts cover positions 1–7. Wisdom teeth are picked individually. -->
            @let upper = jawState('upper');
            @let lower = jawState('lower');
            <button
              type="button"
              class="jaw-toggle"
              [class.is-full]="upper.full"
              [class.is-part]="!upper.full && upper.count > 0"
              [attr.aria-pressed]="upper.full"
              (click)="toggleJaw('upper')"
            >
              <span class="jaw-toggle__mark" aria-hidden="true">
                <pb-icon [name]="upper.full ? 'check' : 'minus'" [size]="12" />
              </span>
              {{ 'tooth.wholeUpper' | translate }}
              @if (!upper.full && upper.count > 0) {
                <span class="jaw-toggle__count">{{
                  'tooth.jawCount'
                    | translate: { count: (upper.count | faNum), total: (upper.total | faNum) }
                }}</span>
              }
            </button>
            <button
              type="button"
              class="jaw-toggle"
              [class.is-full]="lower.full"
              [class.is-part]="!lower.full && lower.count > 0"
              [attr.aria-pressed]="lower.full"
              (click)="toggleJaw('lower')"
            >
              <span class="jaw-toggle__mark" aria-hidden="true">
                <pb-icon [name]="lower.full ? 'check' : 'minus'" [size]="12" />
              </span>
              {{ 'tooth.wholeLower' | translate }}
              @if (!lower.full && lower.count > 0) {
                <span class="jaw-toggle__count">{{
                  'tooth.jawCount'
                    | translate: { count: (lower.count | faNum), total: (lower.total | faNum) }
                }}</span>
              }
            </button>
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

  /** How much of a jaw is chosen, for its shortcut's state. */
  protected jawState(jaw: 'upper' | 'lower'): { count: number; total: number; full: boolean } {
    const teeth = jawShortcutTeeth(jaw);
    const count = teeth.filter((t) => this.selected().includes(t)).length;
    return { count, total: teeth.length, full: count === teeth.length };
  }

  /** Toggle positions 1–7 in this jaw. */
  protected toggleJaw(jaw: 'upper' | 'lower'): void {
    const teeth = jawShortcutTeeth(jaw);
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
