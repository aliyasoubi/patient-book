import { Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PbIcon } from '../icon/icon';
import type { LineIconName } from '../icon/line-icons';

export interface SwitcherOption {
  value: string;
  /** An i18n key. */
  label: string;
  icon?: LineIconName;
}

/**
 * Two to four choices on a fog track, the chosen one lifted on a white pill
 * that slides to it: a page's tabs (`role="tab"`), or one setting's options
 * (`role="radio"`). The pill moves; nothing jumps.
 */
@Component({
  selector: 'pb-switcher',
  standalone: true,
  imports: [PbIcon, TranslatePipe],
  host: {
    '[attr.role]': "kind() === 'tabs' ? 'tablist' : 'radiogroup'",
    '[attr.aria-label]': 'ariaLabel()',
    '[style.--_count]': 'options().length',
    '[style.--_index]': 'index()',
    '[class.is-stretched]': 'stretch()',
    '[class.is-unset]': 'unset()',
  },
  template: `
    <span class="pb-switcher__pill" aria-hidden="true"></span>
    @for (option of options(); track option.value) {
      <button
        class="pb-switcher__option"
        type="button"
        [attr.role]="kind() === 'tabs' ? 'tab' : 'radio'"
        [attr.aria-selected]="kind() === 'tabs' ? value() === option.value : null"
        [attr.aria-checked]="kind() === 'radio' ? value() === option.value : null"
        [class.is-active]="value() === option.value"
        (click)="valueChange.emit(option.value)"
      >
        @if (option.icon) {
          <pb-icon [name]="option.icon" [size]="18" />
        }
        {{ option.label | translate }}
      </button>
    }
  `,
  styleUrl: './switcher.scss',
})
export class PbSwitcher {
  readonly options = input.required<readonly SwitcherOption[]>();
  readonly value = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly kind = input<'tabs' | 'radio'>('tabs');
  /** Fill the container's width, the options sharing it evenly. */
  readonly stretch = input(false);
  readonly valueChange = output<string>();

  /** None of the options is the value (it was set elsewhere): the pill steps away. */
  protected readonly unset = computed(() => !this.options().some((o) => o.value === this.value()));

  protected readonly index = computed(() =>
    Math.max(
      0,
      this.options().findIndex((o) => o.value === this.value()),
    ),
  );
}
