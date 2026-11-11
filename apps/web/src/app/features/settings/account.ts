import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { roleLabel } from '../../shared/labels';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { PbButton, PbIcon, PbInput, PbPage, PbPageHeader, ToastService } from '../../shared/ui';
import { PasswordGate } from './password-gate';
import { markSubmitted } from '../../shared/ui/form-submitted';

/**
 * The two new-password fields must agree. Rather than surface this as a
 * form-group-level error, it is written onto `confirmPassword`'s own errors —
 * `PbTextField` (like every field atom) only reads the control it was bound
 * to, so a cross-field rule has to land where the field is actually looking.
 */
const MIN_LENGTH = 10;

export function passwordsMatch(group: AbstractControl): null {
  const next = group.get('newPassword')?.value as string;
  const confirmCtrl = group.get('confirmPassword');
  const confirm = confirmCtrl?.value as string;
  if (!confirmCtrl) return null;

  const mismatched = !!next && !!confirm && next !== confirm;
  const { mismatch: _drop, ...rest } = confirmCtrl.errors ?? {};
  const nextErrors = mismatched ? { ...rest, mismatch: true } : rest;
  confirmCtrl.setErrors(Object.keys(nextErrors).length ? nextErrors : null, { emitEvent: false });
  return null;
}

@Component({
  selector: 'pb-account',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    PbInput,
    PbButton,
    PbIcon,
    PbPageHeader,
    TranslatePipe,
    PbPage,
    PasswordGate,
  ],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  protected readonly roleLabel = roleLabel;
  protected readonly saving = signal(false);
  /** Errors wait for a first attempt to save, not the first keystroke. */
  protected readonly tried = signal(false);
  protected readonly initial = computed(() => (this.auth.user()?.fullName ?? '').trim().charAt(0));

  protected readonly currentPasswordErrors = computed(() => {
    this.i18n.currentLang();
    return { wrong: this.i18n.instant('account.currentPasswordWrong') };
  });

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

  protected submit(): void {
    this.tried.set(true);
    if (this.form.invalid || this.rules().some((rule) => !rule.met) || this.saving()) {
      markSubmitted(this.form);
      return;
    }
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

  protected back(): void {
    void this.router.navigate(['/settings']);
  }
}
