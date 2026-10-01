import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PbBanner } from './banner';

@Component({
  standalone: true,
  imports: [PbBanner],
  template: `
    <pb-banner id="plain" tone="warning" icon="medical_information" title="سابقه بیماری">
      آلرژی
    </pb-banner>
    <pb-banner id="action" tone="error">
      بارگذاری نشد
      <button pbBannerAction type="button">تلاش دوباره</button>
    </pb-banner>
  `,
})
class Host {}

describe('PbBanner', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the title above the projected text and exposes the tone', () => {
    const banner = render().querySelector('#plain') as HTMLElement;
    expect(banner.dataset['tone']).toBe('warning');
    expect(banner.querySelector('.pb-banner__title')?.textContent).toBe('سابقه بیماری');
    expect(banner.querySelector('.pb-banner__body')?.textContent).toContain('آلرژی');
  });

  it('puts a pbBannerAction element in the trailing slot, and leaves it empty otherwise', () => {
    const root = render();
    const action = root.querySelector('#action .pb-banner__action') as HTMLElement;
    expect(action.querySelector('button')?.textContent).toBe('تلاش دوباره');
    expect(root.querySelector('#action .pb-banner__body button')).toBeNull();
    // Empty, so `:empty` hides it and it takes no gap.
    expect((root.querySelector('#plain .pb-banner__action') as HTMLElement).childNodes.length).toBe(
      0,
    );
  });
});
