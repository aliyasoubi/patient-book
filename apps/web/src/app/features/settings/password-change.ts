import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/ui';

type RuleState = 'idle' | 'met' | 'error' | 'checking';

export interface PasswordRule {
  id: string;
  label: string;
  state: RuleState;
}

@Injectable()
export class PasswordChange {
  private readonly auth = inject(AuthService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  private readonly tried = signal(false);
  private readonly verification = signal<RuleState>('idle');
  readonly saving = computed(() => this.verification() === 'checking');

  /**
   * Each rule is met, not yet met, or already broken. "Not yet" is quiet until
   * the first submit: 9 characters of 10 is a password still being typed,
   * not a mistake. "Broken" is red at once, because typing on cannot fix it:
   * the new password is the current one, the confirmation has already gone
   * off course (it is no longer the start of the new password), or the
   * password is past the longest allowed.
   */
  private readonly localRules = computed(() => {
    const { currentPassword = '', newPassword = '', confirmPassword = '' } = this.values();
    // Match the API's length check for supplementary characters and variation selectors.
    const length = Array.from(newPassword.replace(/[^\uFE0E\uFE0F][\uFE0E\uFE0F]/gu, 'a')).length;
    return [
      {
        id: 'length',
        label: 'account.ruleLength',
        met: length >= 10 && length <= 128,
        broken: length > 128,
      },
      {
        id: 'different',
        label: 'account.ruleDifferent',
        met: !!currentPassword && !!newPassword && newPassword !== currentPassword,
        broken: !!currentPassword && newPassword === currentPassword,
      },
      {
        id: 'match',
        label: 'account.ruleMatch',
        met: !!newPassword && newPassword === confirmPassword,
        broken: !!confirmPassword && !newPassword.startsWith(confirmPassword),
      },
    ];
  });

  readonly rules = computed<PasswordRule[]>(() => {
    const missing = this.tried() && !this.values().currentPassword;
    const state = this.verification();
    let label = 'account.ruleCurrent';
    if (missing) label = 'account.ruleCurrentRequired';
    else if (state === 'checking') label = 'account.ruleCurrentChecking';
    else if (state === 'error') label = 'account.currentPasswordWrong';

    return [
      ...this.localRules().map(({ id, label, met, broken }): PasswordRule => ({
        id,
        label,
        state: met ? 'met' : broken || this.tried() ? 'error' : 'idle',
      })),
      { id: 'current', label, state: missing ? 'error' : state },
    ];
  });

  constructor() {
    this.form.controls.currentPassword.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.verification() === 'error') this.verification.set('idle');
    });
  }

  submit(): void {
    if (this.saving()) return;
    this.tried.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();
    if (!currentPassword || this.localRules().some((rule) => !rule.met)) return;

    this.verification.set('checking');
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.verification.set('met');
        this.toast.success(this.i18n.instant('account.passwordChanged'), { duration: 7000 });
        this.auth.expireSession();
      },
      error: (error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.error?.code === 'ERR_CURRENT_PASSWORD_WRONG'
        ) {
          this.verification.set('error');
          return;
        }
        this.verification.set('idle');
        this.toast.error(this.errors.translate(error));
      },
    });
  }
}
