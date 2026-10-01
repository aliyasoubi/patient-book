import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';
import { provideRouter, RouterLink } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { PbIconButton } from './icon-button';

@Component({
  standalone: true,
  // RouterLink imported as a page would for its own anchors — the case where
  // a `routerLink` input on the wrapper would also match the directive.
  imports: [PbIconButton, MatMenuModule, RouterLink],
  template: `
    <pb-icon-button id="plain" icon="edit" ariaLabel="ویرایش" />
    <pb-icon-button id="menu" icon="more_vert" ariaLabel="عملیات" [menu]="rowMenu" />
    <pb-icon-button id="link" icon="arrow_forward" ariaLabel="بازگشت" [link]="link()" />
    <pb-icon-button id="tel" icon="call" ariaLabel="تماس" href="tel:09120000000" variant="tonal" />
    <mat-menu #rowMenu="matMenu"><button mat-menu-item>ویرایش</button></mat-menu>
    <a routerLink="/patients">پرونده‌ها</a>
  `,
})
class Host {
  readonly link = signal('/patients');
}

function render(): HTMLElement {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PbIconButton', () => {
  it('names the real control and leaves a plain button free of menu state', () => {
    const plain = render().querySelector('#plain button') as HTMLButtonElement;
    expect(plain.getAttribute('aria-label')).toBe('ویرایش');
    expect(plain.hasAttribute('aria-expanded')).toBe(false);
    expect(plain.hasAttribute('aria-haspopup')).toBe(false);
  });

  it('as a menu trigger announces the popup', () => {
    const trigger = render().querySelector('#menu button') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders anchors for a route and a URL, and never makes the wrapper focusable', () => {
    const root = render();
    expect(root.querySelector('#link a')?.getAttribute('href')).toBe('/patients');
    expect(root.querySelector('#tel a')?.getAttribute('href')).toBe('tel:09120000000');
    // `link`, not `routerLink`: the wrapper must not pick up RouterLink's tabindex.
    for (const host of Array.from(root.querySelectorAll('pb-icon-button'))) {
      expect(host.hasAttribute('tabindex')).toBe(false);
    }
  });
});
