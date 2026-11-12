import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PersianNumberPipe, formatPersianCount } from '../../pipes/persian-number.pipe';
import { PbButton } from '../button/button';
import { type ToothWork, jawTeeth, teethByWork, teethSummary, toothName } from './teeth';
import { mouthView } from './tooth-shapes';
import { PbIcon } from '../icon/icon';
import type { LineIconName } from '../icon/line-icons';

/** The categorical tints in styles.scss — a group, never a status. */
export type ToothWorkTone =
  'sky' | 'teal' | 'green' | 'indigo' | 'violet' | 'plum' | 'sand' | 'slate';

/** One kind of work the chart can mark a tooth with. */
export interface ToothWorkKind {
  value: string;
  /** i18n key of its name. */
  label: string;
  /** i18n key of the one letter drawn on a tooth, so the chart never relies on colour alone. */
  mark: string;
  tone: ToothWorkTone;
  /** Drawn on a marked tooth and on its tool, so the kind reads at a glance. */
  icon: LineIconName;
}

interface WorkGroup {
  kind: ToothWorkKind;
  count: string;
  summary: string;
}

/**
 * The teeth of a piece of work and what each one gets, marked on a chart the
 * way a lab prescription is: a jaw's crowns, laminates and implant crowns in
 * one go.
 *
 * The kind of work chosen outside the chart — `brush` — is what a tap puts on
 * a tooth. Tapping a tooth that has it takes it off; a tooth with other work
 * takes the chosen one instead. With nothing chosen a tap only takes work off.
 * Each kind has its own tint and letter, and the list under the chart reads
 * the teeth back kind by kind. Laid out as {@link PbToothPicker} is.
 */
@Component({
  selector: 'pb-tooth-work-picker',
  standalone: true,
  imports: [TranslatePipe, PersianNumberPipe, PbButton, PbIcon],
  template: `
    <div
      class="chart"
      role="group"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-invalid]="invalid() || null"
    >
      <!-- The tools: what a tap puts on a tooth. Picked here, used on the chart below. -->
      <div class="tools" role="radiogroup" [attr.aria-label]="'tooth.toolsAria' | translate">
        @for (kind of kinds(); track kind.value) {
          <button
            type="button"
            class="tool"
            role="radio"
            [class.is-on]="brushKind()?.value === kind.value"
            [attr.aria-checked]="brushKind()?.value === kind.value"
            [style.--tooth-bg]="toneVar(kind.tone, 'bg')"
            [style.--tooth-fg]="toneVar(kind.tone, 'fg')"
            (click)="brushChange.emit(kind.value)"
          >
            <span class="tool__icon"><pb-icon [name]="kind.icon" [size]="18" /></span>
            <span class="tool__label">{{ kind.label | translate }}</span>
            @if (countOf(kind.value); as n) {
              <span class="tool__count">{{ n | faNum }}</span>
            }
          </button>
        }
      </div>

      <div class="chart__mouth" dir="ltr">
        <span class="chart__side chart__side--right">{{ 'tooth.patientRight' | translate }}</span>
        <span class="chart__side chart__side--left">{{ 'tooth.patientLeft' | translate }}</span>

        @for (jaw of jaws(); track jaw.id) {
          <div class="chart__jaw" [attr.data-jaw]="jaw.id">
            <span class="chart__jaw-label">{{ jaw.label | translate }}</span>
            <div class="chart__row" role="group" [attr.aria-label]="jaw.label | translate">
              @for (tooth of jaw.teeth; track tooth.fdi; let i = $index) {
                @let kind = kindOf(tooth.fdi);
                <button
                  type="button"
                  class="chart__tooth"
                  [class.chart__tooth--on]="!!kind"
                  [class.is-midline]="i === 7"
                  [style.--tooth-bg]="kind ? toneVar(kind.tone, 'bg') : null"
                  [style.--tooth-fg]="kind ? toneVar(kind.tone, 'fg') : null"
                  [style.--_lift.px]="tooth.lift"
                  [attr.aria-pressed]="!!kind"
                  [attr.aria-label]="toothLabel(tooth.fdi, kind)"
                  [title]="toothLabel(tooth.fdi, kind)"
                  (click)="tap(tooth.fdi)"
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
                  <span class="chart__num">{{ tooth.position | faNum }}</span>
                  <span class="chart__badge" aria-hidden="true">
                    @if (kind) {
                      <pb-icon [name]="kind.icon" [size]="11" [stroke]="2" />
                      <span class="cdk-visually-hidden">{{ kind.mark | translate }}</span>
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
          @if (brushKind(); as b) {
            {{ 'tooth.brushHint' | translate: { kind: (b.label | translate) } }}
          }
        </span>
        <div class="chart__shortcuts">
          <!-- On when the jaw has no free tooth left for the work in hand; a dash
               and a count when some of its teeth are marked. -->
          @let upper = jawState('upper');
          @let lower = jawState('lower');
          <button
            type="button"
            class="jaw-toggle"
            [class.is-full]="upper.full"
            [class.is-part]="!upper.full && upper.count > 0"
            [attr.aria-pressed]="upper.full"
            [disabled]="!brushKind()"
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
            [disabled]="!brushKind()"
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
          <pb-button variant="text" tone="neutral" [disabled]="!value().length" (click)="clear()">{{
            'tooth.clear' | translate
          }}</pb-button>
        </div>
      </div>

      @if (groups().length) {
        <ul class="chart__legend">
          @for (group of groups(); track group.kind.value) {
            <li class="chart__group">
              <span
                class="chart__swatch"
                aria-hidden="true"
                [style.--tooth-bg]="toneVar(group.kind.tone, 'bg')"
                [style.--tooth-fg]="toneVar(group.kind.tone, 'fg')"
                ><pb-icon [name]="group.kind.icon" [size]="13" [stroke]="2.2"
              /></span>
              <span class="chart__group-text">
                <strong>{{ group.kind.label | translate }}</strong>
                <span class="chart__group-count">{{ group.count }}</span>
                <span class="chart__group-teeth">{{ group.summary }}</span>
              </span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styleUrls: ['./tooth-picker.scss', './tooth-work-picker.scss'],
})
export class PbToothWorkPicker {
  private readonly i18n = inject(TranslateService);

  /** Each marked tooth and its work, sorted by tooth. */
  readonly value = input<readonly ToothWork[]>([]);
  /** Every kind the chart may show, in the order the list reads them back. */
  readonly kinds = input.required<readonly ToothWorkKind[]>();
  /** What a tap puts on a tooth; null when no kind of work is chosen. */
  readonly brush = input<string | null>(null);
  readonly ariaLabel = input.required<string>();
  readonly invalid = input(false);
  readonly valueChange = output<ToothWork[]>();
  /** A tool picked on the chart's own palette. */
  readonly brushChange = output<string>();

  /** The mouth, drawn as {@link PbToothPicker} draws it. */
  protected readonly jaws = computed(() => {
    this.i18n.currentLang();
    return mouthView(this.i18n);
  });

  private readonly kindsByValue = computed(
    () => new Map(this.kinds().map((kind) => [kind.value, kind])),
  );
  private readonly workByTooth = computed(
    () => new Map(this.value().map((w) => [w.tooth, w.workType])),
  );

  /** The chosen kind, if the chart can mark teeth with it. */
  protected readonly brushKind = computed(() => {
    const brush = this.brush();
    return brush ? (this.kindsByValue().get(brush) ?? null) : null;
  });

  protected readonly groups = computed<WorkGroup[]>(() => {
    this.i18n.currentLang();
    const kinds = this.kindsByValue();
    return teethByWork(this.value(), [...kinds.keys()]).map(({ workType, teeth }) => ({
      kind: kinds.get(workType)!,
      count: this.i18n.instant('tooth.count', { count: formatPersianCount(teeth.length) }),
      summary: teethSummary(teeth, this.i18n),
    }));
  });

  /** How many teeth carry a kind, for its tool. */
  protected countOf(kind: string): number {
    return this.value().filter((w) => w.workType === kind).length;
  }

  protected kindOf(tooth: number): ToothWorkKind | null {
    const work = this.workByTooth().get(tooth);
    return work ? (this.kindsByValue().get(work) ?? null) : null;
  }

  protected toneVar(tone: ToothWorkTone, part: 'bg' | 'fg'): string {
    return `var(--pb-cat-${tone}-${part})`;
  }

  protected toothLabel(tooth: number, kind: ToothWorkKind | null): string {
    const name = toothName(tooth, this.i18n);
    return kind
      ? `${name}${this.i18n.instant('list.separator')}${this.i18n.instant(kind.label)}`
      : name;
  }

  protected tap(tooth: number): void {
    const brush = this.brushKind()?.value ?? null;
    const current = this.workByTooth().get(tooth);
    if (current && (current === brush || !brush)) {
      this.emit(this.value().filter((w) => w.tooth !== tooth));
    } else if (brush) {
      this.emit([...this.value().filter((w) => w.tooth !== tooth), { tooth, workType: brush }]);
    }
  }

  /**
   * How much of a jaw is marked, for its shortcut's state: full once no tooth
   * is free and the work in hand is on some of them — the next press takes it off.
   */
  protected jawState(jaw: 'upper' | 'lower'): { count: number; total: number; full: boolean } {
    const teeth = jawTeeth(jaw);
    const work = this.workByTooth();
    const brush = this.brushKind()?.value;
    const count = teeth.filter((t) => work.has(t)).length;
    const full = count === teeth.length && teeth.some((t) => work.get(t) === brush);
    return { count, total: teeth.length, full };
  }

  /**
   * The chosen work on every free tooth of the jaw; once none is free, the same
   * button takes that work off the jaw again. Teeth with other work keep it.
   */
  protected toggleJaw(jaw: 'upper' | 'lower'): void {
    const brush = this.brushKind()?.value;
    if (!brush) return;
    const teeth = jawTeeth(jaw);
    const work = this.workByTooth();
    const free = teeth.filter((t) => !work.has(t));
    this.emit(
      free.length
        ? [...this.value(), ...free.map((tooth) => ({ tooth, workType: brush }))]
        : this.value().filter((w) => !(teeth.includes(w.tooth) && w.workType === brush)),
    );
  }

  protected clear(): void {
    this.emit([]);
  }

  private emit(work: ToothWork[]): void {
    this.valueChange.emit([...work].sort((a, b) => a.tooth - b.tooth));
  }
}
