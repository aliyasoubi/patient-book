import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatChipOption } from '@angular/material/chips';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { type FilterChipOption, PbFilterChips } from './filter-chips';

const OPTIONS: FilterChipOption[] = [
  { value: 'overdue', label: 'عقب‌افتاده' },
  { value: 'week', label: 'این هفته' },
];

@Component({
  standalone: true,
  imports: [PbFilterChips],
  template: `
    <pb-filter-chips
      [options]="options"
      [selected]="selected()"
      [multiple]="multiple()"
      ariaLabel="فیلترها"
      (selectedChange)="emitted.push($event); selected.set($event)"
    />
  `,
})
class Host {
  readonly options = OPTIONS;
  readonly selected = signal<string[]>([]);
  readonly multiple = signal(false);
  readonly emitted: string[][] = [];
}

function setup(multiple: boolean, selected: string[] = []) {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.multiple.set(multiple);
  fixture.componentInstance.selected.set(selected);
  fixture.detectChanges();
  const chips = fixture.debugElement
    .queryAll(By.directive(MatChipOption))
    .map((d) => d.componentInstance as MatChipOption);
  const tap = (index: number) => {
    chips[index].selectViaInteraction();
    fixture.detectChanges();
  };
  const toggle = (index: number) => {
    chips[index]._handlePrimaryActionInteraction();
    fixture.detectChanges();
  };
  return { fixture, chips, tap, toggle, host: fixture.componentInstance };
}

describe('PbFilterChips', () => {
  it('marks the chips named in `selected`', () => {
    const { chips } = setup(true, ['week']);
    expect(chips.map((c) => c.selected)).toEqual([false, true]);
  });

  it('single: picking another chip replaces the answer, and it arrives as a list', () => {
    const { tap, host } = setup(false, ['overdue']);
    tap(1);
    expect(host.emitted.at(-1)).toEqual(['week']);
  });

  it('single: tapping the selected chip again clears it to an empty list', () => {
    const { toggle, host } = setup(false, ['week']);
    toggle(1);
    expect(host.emitted.at(-1)).toEqual([]);
  });

  it('multiple: each chip toggles independently', () => {
    const { toggle, host } = setup(true, ['overdue']);
    toggle(1);
    expect(host.emitted.at(-1)).toEqual(['overdue', 'week']);
    toggle(0);
    expect(host.emitted.at(-1)).toEqual(['week']);
  });
});
