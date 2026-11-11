import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { markSubmitted } from '../form-submitted';
import { PbInput } from './input';

@Component({
  standalone: true,
  imports: [PbInput],
  template: `<pb-input [control]="control" label="نام کاربری" [type]="type" hint="راهنما" />`,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true, validators: Validators.required });
  type: 'text' | 'password' = 'text';
}

function render(type: 'text' | 'password' = 'text') {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.type = type;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, input: root.querySelector('input') as HTMLInputElement };
}

describe('PbInput', () => {
  it('ties the label to the input', () => {
    const { root, input } = render();
    expect(root.querySelector('label')?.getAttribute('for')).toBe(input.id);
  });

  it('keeps the hint inside the box and opens a line below only for an error', () => {
    const { fixture, root, input } = render();
    const message = () => root.querySelector('.pb-input__message');
    expect(input.placeholder).toContain('راهنما');
    expect(message()?.textContent?.trim()).toBe('');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    // Leaving the field says nothing; a save attempt does.
    fixture.componentInstance.control.markAsTouched();
    fixture.detectChanges();
    expect(message()?.classList).not.toContain('pb-input__message--error');

    markSubmitted(fixture.componentInstance.control);
    fixture.detectChanges();
    expect(message()?.classList).toContain('pb-input__message--error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(message()?.id);
  });

  it('reveals a password and hides it again', () => {
    const { fixture, root, input } = render('password');
    const toggle = root.querySelector('.pb-input__toggle') as HTMLButtonElement;
    expect(input.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves the error to the form when told to, however the field was left', () => {
    @Component({
      standalone: true,
      imports: [PbInput],
      template: `<pb-input [control]="control" label="x" [showErrors]="tried()" />`,
    })
    class Submitted {
      readonly control = new FormControl('', {
        nonNullable: true,
        validators: Validators.required,
      });
      readonly tried = signal(false);
    }
    TestBed.configureTestingModule({
      imports: [Submitted],
      providers: [provideTranslateService()],
    });
    const fixture = TestBed.createComponent(Submitted);
    fixture.componentInstance.control.markAsTouched();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('input')?.getAttribute('aria-invalid')).toBeNull();

    fixture.componentInstance.tried.set(true);
    fixture.detectChanges();
    expect(root.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('.pb-input__message')?.classList).toContain(
      'pb-input__message--error',
    );
  });
});
