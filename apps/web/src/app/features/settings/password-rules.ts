import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import type { PasswordRule } from './password-change';

/**
 * What a new password has to be, read as it is typed. On top, a bar of one
 * segment per rule, filling as rules are met; under it the rules, each with a
 * mark that morphs — a dot while waiting, drawn into a tick when met, into a
 * cross when broken — rather than swapping one icon for another. Only the
 * mark and its segment take colour; the words stay calm until something is
 * actually wrong.
 */
@Component({
  selector: 'pb-password-rules',
  imports: [PersianNumberPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './password-rules.scss',
  template: `
    <div class="box">
      <div class="head">
        <span class="head__title">{{ 'account.rulesTitle' | translate }}</span>
        <span class="head__count">
          {{
            'account.rulesCount'
              | translate: { met: (metCount() | faNum), total: (rules().length | faNum) }
          }}
        </span>
      </div>
      <div class="bar" aria-hidden="true">
        @for (rule of rules(); track rule.id) {
          <span class="bar__seg" [attr.data-state]="rule.state"></span>
        }
      </div>

      <ul class="rules" role="list" aria-live="polite">
        @for (rule of rules(); track rule.id) {
          <li class="rule" [attr.data-state]="rule.state">
            <span class="mark" aria-hidden="true">
              <svg viewBox="0 0 18 18">
                <path class="mark__path" />
              </svg>
              <span class="mark__spinner"></span>
            </span>
            <span class="rule__text">
              {{ rule.label | translate }}
              @if (rule.state === 'met') {
                <span class="visually-hidden">{{ 'account.ruleMet' | translate }}</span>
              } @else if (rule.state === 'error' && rule.id !== 'current') {
                <span class="visually-hidden">{{ 'account.ruleUnmet' | translate }}</span>
              }
            </span>
          </li>
        }
      </ul>
    </div>
  `,
})
export class PasswordRules {
  readonly rules = input.required<readonly PasswordRule[]>();

  protected readonly metCount = computed(
    () => this.rules().filter((rule) => rule.state === 'met').length,
  );
}
