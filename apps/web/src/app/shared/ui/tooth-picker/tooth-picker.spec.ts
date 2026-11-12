import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { PbToothPicker } from './tooth-picker';

@Component({
  standalone: true,
  imports: [PbToothPicker],
  template: `
    <pb-tooth-picker
      [selected]="selected()"
      [single]="single()"
      ariaLabel="دندان‌ها"
      (selectedChange)="selected.set($event)"
    />
  `,
})
class Host {
  readonly selected = signal<number[]>([]);
  readonly single = signal(false);
}

function setup(single: boolean) {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.single.set(single);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const tap = (fdi: number) => {
    el.querySelector<HTMLButtonElement>(`button[data-fdi="${fdi}"]`)!.click();
    fixture.detectChanges();
  };
  return { el, tap, selected: () => fixture.componentInstance.selected() };
}

describe('PbToothPicker', () => {
  it('distinguishes all four wisdom teeth and lets them be selected', () => {
    const { el, tap, selected } = setup(false);
    const wisdom = [...el.querySelectorAll('.chart__tooth--wisdom')];
    expect(wisdom.map((button) => button.getAttribute('data-fdi'))).toEqual([
      '18',
      '28',
      '48',
      '38',
    ]);
    expect(wisdom.every((button) => button.getAttribute('aria-label') === 'tooth.wisdomName')).toBe(
      true,
    );
    tap(48);
    expect(selected()).toEqual([48]);
  });

  it('adds each tooth tapped, and offers the whole jaw', () => {
    const { el, tap, selected } = setup(false);
    tap(36);
    tap(37);
    expect(selected()).toEqual([36, 37]);
    // Both jaws offered as toggles; the lower one shows it is partly chosen.
    const jaws = el.querySelectorAll('.jaw-toggle');
    expect(jaws.length).toBe(2);
    expect(jaws[0].classList).not.toContain('is-part');
    expect(jaws[1].classList).toContain('is-part');
    expect(jaws[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('holds to one tooth when single: a tap picks it in place of the last', () => {
    const { el, tap, selected } = setup(true);
    tap(36);
    tap(46);
    expect(selected()).toEqual([46]);
    tap(46);
    expect(selected()).toEqual([]);
    // Only «clear»: a whole jaw is never one tooth.
    expect(el.querySelectorAll('.jaw-toggle').length).toBe(0);
    expect(el.querySelectorAll('.chart__shortcuts pb-button').length).toBe(1);
  });
});
