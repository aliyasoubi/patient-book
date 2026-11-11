import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { AuthService } from '../../core/services/auth.service';
import { PbButton, PbIcon, PbInput, ToastService } from '../../shared/ui';
import { passwordsMatch } from './account';

const MIN_LENGTH = 10;

/**
 * The first-sign-in gate: a temporary password has to be replaced before
 * any patient file opens (the API refuses data until it is). Drawn over the
 * app itself — the sidebar and panel blurred behind — so it reads as one
 * step on the way in, not a page of its own.
 *
 * Three fields, a checklist that ticks itself off as the new password meets
 * each rule, and the one action. Errors wait for a first attempt. A changed
 * password ends every session, this one included: the toast says so and
 * sign-in comes next.
 */
@Component({
  selector: 'pb-password-gate',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, PbButton, PbIcon, PbInput],
  templateUrl: './password-gate.html',
  styleUrl: './password-gate.scss',
})
export class PasswordGate {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);
  protected readonly auth = inject(AuthService);

  protected readonly saving = signal(false);
  protected readonly tried = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: [
        '',
        [Validators.required, Validators.minLength(MIN_LENGTH), Validators.maxLength(128)],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  private readonly values = toSignal(
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  /** The rules, checked live: each ticks itself off as it is met. */
  protected readonly rules = computed(() => {
    const { currentPassword, newPassword, confirmPassword } = this.values();
    return [
      { key: 'account.ruleLength', met: newPassword.length >= MIN_LENGTH },
      { key: 'account.ruleDifferent', met: !!newPassword && newPassword !== currentPassword },
      { key: 'account.ruleMatch', met: !!newPassword && newPassword === confirmPassword },
    ];
  });

  protected readonly errorMessages = computed(() => {
    this.i18n.currentLang();
    return {
      wrong: this.i18n.instant('account.currentPasswordWrong'),
      mismatch: this.i18n.instant('field.mismatch'),
    };
  });

  protected submit(): void {
    if (this.saving()) return;
    this.tried.set(true);
    if (this.form.invalid || this.rules().some((rule) => !rule.met)) return;
    this.saving.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();

    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.i18n.instant('account.passwordChanged'), { duration: 7000 });
        // Changing the password revokes every session, this one included.
        this.auth.expireSession();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.form.controls.currentPassword.setErrors({ wrong: true });
        }
        this.toast.error(this.errors.translate(error));
      },
    });
  }

  protected logout(): void {
    this.auth.logout();
  }
}
