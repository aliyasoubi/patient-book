import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { PbButton } from './button';

@Component({
  standalone: true,
  imports: [PbButton],
  template: `
    <pb-button
      icon="tune"
      [ariaLabel]="ariaLabel()"
      [ariaExpanded]="expanded()"
      [badge]="badge()"
      [collapseBelow]="560"
      tone="danger"
    >
      فیلترها
    </pb-button>
  `,
})
class Host {
  readonly ariaLabel = signal<string | null>('مرتب‌سازی');
  readonly expanded = signal<boolean | null>(true);
  readonly badge = signal<string | null>('۲');
}

function setup() {
  const narrow = new BehaviorSubject<BreakpointState>({ matches: false, breakpoints: {} });
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: BreakpointObserver, useValue: { observe: () => narrow } }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const host = fixture.debugElement.query(By.directive(PbButton)).nativeElement as HTMLElement;
  const button = host.querySelector('button') as HTMLButtonElement;
  return { fixture, host, button, narrow };
}

describe('PbButton', () => {
  it('puts aria attributes on the real button, not the wrapper', () => {
    const { host, button } = setup();
    expect(button.getAttribute('aria-label')).toBe('مرتب‌سازی');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(host.hasAttribute('aria-label')).toBe(false);
  });

  it('omits aria attributes that are not set', () => {
    const { fixture, button } = setup();
    fixture.componentInstance.ariaLabel.set(null);
    fixture.componentInstance.expanded.set(null);
    fixture.detectChanges();
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.hasAttribute('aria-expanded')).toBe(false);
  });

  it('marks a danger button so its tokens switch to the error role', () => {
    const { host } = setup();
    expect(host.classList).toContain('pb-button--danger');
  });

  it('below the breakpoint clips the label but keeps it and the badge', () => {
    const { fixture, host, button, narrow } = setup();
    const label = () => button.querySelector('.visually-hidden');
    expect(label()).toBeNull();

    narrow.next({ matches: true, breakpoints: {} });
    fixture.detectChanges();

    expect(host.classList).toContain('pb-button--collapsed');
    expect(label()?.textContent?.trim()).toBe('فیلترها');
    expect(button.querySelector('.pb-btn__badge')?.textContent).toBe('۲');
  });
});
