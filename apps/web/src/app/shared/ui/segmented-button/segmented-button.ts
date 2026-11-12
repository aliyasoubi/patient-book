import { Component, computed, input, output } from '@angular/core';

import type { LineIconName } from '../icon/line-icons';
import { PbSwitcher, type SwitcherOption } from '../switcher/switcher';

export interface SegmentOption {
  value: string;
  label: string;
  icon?: LineIconName;
  /** Resolve `label` as an i18n key. */
  translate?: boolean;
}

/**
 * Two to five mutually exclusive choices shown all at once — which jaw, which
 * column of the lab board. Drawn as the app's switcher: a fog track with the
 * chosen option on a white pill that slides to it, so every choice of this
 * kind in the app looks and moves the same. Unlike filter chips, one segment
 * is always selected.
 */
@Component({
  selector: 'pb-segmented-button',
  standalone: true,
  imports: [PbSwitcher],
  template: `
    <pb-switcher
      kind="radio"
      [options]="switcherOptions()"
      [value]="value()"
      [stretch]="stretch()"
      [ariaLabel]="ariaLabel()"
      (valueChange)="valueChange.emit($event)"
    />
  `,
  styles: `
    :host {
      display: inline-block;
      max-inline-size: 100%;
    }
  `,
})
export class PbSegmentedButton {
  readonly options = input.required<readonly SegmentOption[]>();
  readonly value = input.required<string>();
  readonly ariaLabel = input.required<string>();
  /** Fill the width, the segments sharing it evenly. */
  readonly stretch = input(false);
  readonly valueChange = output<string>();

  /** The switcher translates its labels; a literal label passes through unchanged. */
  protected readonly switcherOptions = computed<SwitcherOption[]>(() =>
    this.options().map((o) => ({ value: o.value, label: o.label, icon: o.icon })),
  );
}
