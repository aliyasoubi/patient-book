import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { roleLabel } from '../../shared/labels';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { PbButton, PbSurface, PbTextField } from '../../shared/ui';

/**
 * The two new-password fields must agree. Rather than surface this as a
 * form-group-level error, it is written onto `confirmPassword`'s own errors —
 * `PbTextField` (like every field atom) only reads the control it was bound
 * to, so a cross-field rule has to land where the field is actually looking.
 */
function passwordsMatch(group: AbstractControl): null {
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
  imports: [ReactiveFormsModule, MatButtonModule, PbTextField, PbButton, PbSurface, MatIconModule],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  private readonly errors = inject(ApiErrorTranslator);

  protected readonly roleLabel = roleLabel;
  protected readonly saving = signal(false);
  protected readonly savingLabel = $localize`:@@account.savingLabel:در حال ذخیره…`;

  protected readonly currentPasswordErrors = {
    wrong: $localize`:@@account.currentPasswordWrong:رمز عبور فعلی نادرست است`,
  };

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();

    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(
          $localize`:@@account.passwordChanged:رمز عبور تغییر کرد. برای امنیت، از همه دستگاه‌ها خارج شدید.`,
          $localize`:@@action.dismiss:بستن`,
          { duration: 7000 },
        );
        // Changing the password revokes every session, this one included.
        this.auth.logout();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.form.controls.currentPassword.setErrors({ wrong: true });
        }
        this.snackBar.open(this.errors.translate(error), $localize`:@@action.dismiss:بستن`);
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/settings']);
  }
}
