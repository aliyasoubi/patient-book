import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { PbButton, PbIcon, PbInput } from '../../shared/ui';
import { PasswordChange } from './password-change';
import { PasswordRules } from './password-rules';
import { SignOutService } from '../../core/services/sign-out.service';

/** The first-sign-in gate for replacing a temporary password. */
@Component({
  selector: 'pb-password-gate',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, PbButton, PbIcon, PbInput, PasswordRules],
  providers: [PasswordChange],
  templateUrl: './password-gate.html',
  styleUrl: './password-gate.scss',
})
export class PasswordGate {
  private readonly auth = inject(AuthService);
  private readonly signOut = inject(SignOutService);
  protected readonly password = inject(PasswordChange);

  protected logout(): void {
    this.signOut.ask();
  }
}
