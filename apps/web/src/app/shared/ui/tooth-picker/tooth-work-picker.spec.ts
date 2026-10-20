import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import type { ToothWork } from './teeth';
import { type ToothWorkKind, PbToothWorkPicker } from './tooth-work-picker';

const KINDS: ToothWorkKind[] = [
  { value: 'crown', label: 'روکش', mark: 'ر', tone: 'sky' },
  { value: 'laminate', label: 'لمینیت', mark: 'ل', tone: 'teal' },
];

@Component({
  standalone: true,
  imports: [PbToothWorkPicker],
  template: `
    <pb-tooth-work-picker
      [value]="value()"
      [kinds]="kinds"
      [brush]="brush()"
      ariaLabel="دندان‌ها"
      (valueChange)="value.set($event)"
    />
  `,
})
class Host {
  readonly kinds = KINDS;
  readonly value = signal<ToothWork[]>([]);
  readonly brush = signal<string | null>('crown');
}

function setup(value: ToothWork[] = []) {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.value.set(value);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const host = fixture.componentInstance;
  /** The tooth button for an FDI number: quadrant 1 is drawn 7…1, quadrant 2 1…7. */
  const tooth = (fdi: number): HTMLButtonElement => {
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.chart__tooth')];
    const order = [1, 2, 4, 3].flatMap((q) =>
      [1, 2, 3, 4, 5, 6, 7].map((n) => q * 10 + (q === 1 || q === 4 ? 8 - n : n)),
    );
    return buttons[order.indexOf(fdi)];
  };
  const tap = (fdi: number) => {
    tooth(fdi).click();
    fixture.detectChanges();
  };
  /** Choose another kind of work outside the chart, as the form's chips do. */
  const choose = (brush: string | null) => {
    host.brush.set(brush);
    fixture.detectChanges();
  };
  const shortcut = (index: number) => {
    el.querySelectorAll<HTMLButtonElement>('.chart__shortcuts button')[index].click();
    fixture.detectChanges();
  };
  return { fixture, el, host, tooth, tap, choose, shortcut };
}

describe('PbToothWorkPicker', () => {
  it('puts the chosen work on a tapped tooth, and a second tap takes it off', () => {
    const { host, tap, tooth } = setup();
    tap(16);
    expect(host.value()).toEqual([{ tooth: 16, workType: 'crown' }]);
    expect(tooth(16).getAttribute('aria-pressed')).toBe('true');
    expect(tooth(16).textContent).toContain('ر');
    tap(16);
    expect(host.value()).toEqual([]);
  });

  it('mixes work in one chart: another kind repaints a tooth and leaves the rest', () => {
    const { host, tap, choose } = setup([
      { tooth: 14, workType: 'crown' },
      { tooth: 15, workType: 'crown' },
    ]);
    choose('laminate');
    tap(11);
    tap(15);
    expect(host.value()).toEqual([
      { tooth: 11, workType: 'laminate' },
      { tooth: 14, workType: 'crown' },
      { tooth: 15, workType: 'laminate' },
    ]);
  });

  it('with no work chosen, only takes work off', () => {
    const { host, tap, choose } = setup([{ tooth: 14, workType: 'crown' }]);
    choose(null);
    tap(11);
    tap(14);
    expect(host.value()).toEqual([]);
  });

  it('fills the free teeth of a jaw, then takes that work off it again', () => {
    const { host, shortcut } = setup([{ tooth: 16, workType: 'laminate' }]);
    shortcut(0);
    expect(host.value()).toHaveLength(14);
    expect(host.value().find((w) => w.tooth === 16)?.workType).toBe('laminate');
    shortcut(0);
    expect(host.value()).toEqual([{ tooth: 16, workType: 'laminate' }]);
  });

  it('reads the teeth back kind by kind under the chart', () => {
    const { el } = setup([
      { tooth: 21, workType: 'laminate' },
      { tooth: 14, workType: 'crown' },
    ]);
    const groups = [...el.querySelectorAll('.chart__group strong')].map((g) => g.textContent);
    expect(groups).toEqual(['روکش', 'لمینیت']);
  });
});
