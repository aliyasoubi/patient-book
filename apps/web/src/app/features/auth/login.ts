import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { isHandledByCaller } from '../../core/interceptors/error.interceptor';
import { PbButton, PbIcon, PbInput, PbLogo, ToastService } from '../../shared/ui';

@Component({
  selector: 'pb-login',
  standalone: true,
  imports: [ReactiveFormsModule, PbButton, PbLogo, PbInput, PbIcon, TranslatePipe],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly formDirective = viewChild.required(FormGroupDirective);

  protected readonly loading = signal(false);
  /** One sideways nudge of the column when a sign-in is refused. */
  protected readonly shaking = signal(false);
  /** Caps Lock is the usual reason a correct password is rejected — say so before submit. */
  protected readonly capsLock = signal(false);
  /** One question at a time: the username, then the password. */
  protected readonly step = signal<1 | 2>(1);
  /**
   * Which fields the user has tried to move past. Errors wait for that —
   * nothing is flagged while someone is still typing, or has only tabbed by.
   */
  protected readonly tried = signal({ username: false, password: false });

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  protected readonly username = toSignal(this.form.controls.username.valueChanges, {
    initialValue: '',
  });
  protected readonly initial = computed(() => this.username().trim().charAt(0));

  /** Where a step stands against the current one: done with, current, or still to come. */
  protected pos(step: 1 | 2): 'past' | 'current' | 'next' {
    return step < this.step() ? 'past' : step > this.step() ? 'next' : 'current';
  }

  protected trackCapsLock(event: Event): void {
    // Browser autofill fires bare `Event`s named keydown/keyup, with no modifier state.
    if (event instanceof KeyboardEvent) {
      this.capsLock.set(event.getModifierState('CapsLock'));
    }
  }

  protected stopShaking(event: AnimationEvent): void {
    if (event.target === event.currentTarget) this.shaking.set(false);
  }

  /** Enter or the button: step one moves on to the password, step two signs in. */
  protected submit(): void {
    if (this.step() === 1) {
      this.next();
      return;
    }
    if (this.loading()) return;
    this.tried.update((t) => ({ ...t, password: true }));
    if (this.form.controls.password.invalid) return;
    if (this.form.controls.username.invalid) {
      this.back();
      return;
    }
    this.loading.set(true);

    const { username, password: secret } = this.form.getRawValue();
    this.auth.login(username, secret).subscribe({
      next: (session) => {
        const returnUrl = session.user.mustChangePassword
          ? '/settings/account'
          : (this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard');
        void this.router.navigateByUrl(returnUrl);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        // A refused sign-in (401, 400…) is left to this screen; anything
        // unexpected — offline, a server fault, too many tries — has already
        // been toasted by the error interceptor, so it is not said twice.
        if (isHandledByCaller(error)) this.toast.error(this.errors.translate(error));
        this.shaking.set(true);
        this.retryPassword();
      },
    });
  }

  protected back(): void {
    this.step.set(1);
    this.focusField('username');
  }

  private next(): void {
    this.tried.update((t) => ({ ...t, username: true }));
    if (this.form.controls.username.invalid) return;
    this.step.set(2);
    this.focusField('current-password');
  }

  /**
   * Clear the password for another try, keep the username, and put the cursor
   * back in the password field. Reset through the form directive: resetting
   * the control alone leaves the form "submitted", and the empty field would
   * greet the retry with a required-field error the user has not caused.
   */
  private retryPassword(): void {
    const { username } = this.form.getRawValue();
    this.formDirective().resetForm({ username, password: '' });
    this.tried.update((t) => ({ ...t, password: false }));
    this.focusField('current-password');
  }

  /** After the step has rendered, and so is no longer inert. */
  private focusField(autocomplete: 'username' | 'current-password'): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLInputElement>(`input[autocomplete="${autocomplete}"]`)
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }
}
