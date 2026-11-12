import { Component, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { roleLabel } from '../../shared/labels';
import { PbButton, PbIcon, PbInput, PbPage, PbPageHeader } from '../../shared/ui';
import { PasswordGate } from './password-gate';
import { PasswordChange } from './password-change';
import { PasswordRules } from './password-rules';

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
    PasswordRules,
  ],
  providers: [PasswordChange],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly roleLabel = roleLabel;
  protected readonly password = inject(PasswordChange);
  protected readonly initial = computed(() => (this.auth.user()?.fullName ?? '').trim().charAt(0));

  protected back(): void {
    void this.router.navigate(['/settings']);
  }
}
