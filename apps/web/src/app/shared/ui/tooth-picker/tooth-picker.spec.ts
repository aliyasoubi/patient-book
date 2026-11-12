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
  /** The tooth button for an FDI number: quadrant 1 is drawn 7…1, quadrant 2 1…7. */
  const tap = (fdi: number) => {
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.chart__tooth')];
    const order = [1, 2, 4, 3].flatMap((q) =>
      [1, 2, 3, 4, 5, 6, 7].map((n) => q * 10 + (q === 1 || q === 4 ? 8 - n : n)),
    );
    buttons[order.indexOf(fdi)].click();
    fixture.detectChanges();
  };
  return { el, tap, selected: () => fixture.componentInstance.selected() };
}

describe('PbToothPicker', () => {
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
