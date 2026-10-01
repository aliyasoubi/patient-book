import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { PbTextField, type TextFieldOption } from './text-field';

@Component({
  standalone: true,
  imports: [PbTextField],
  template: `<pb-text-field [control]="control" [options]="options()" (optionSelected)="picked = $event" />`,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true });
  readonly options = signal<TextFieldOption[]>([]);
  picked: TextFieldOption | null = null;
}

describe('PbTextField autocomplete', () => {
  it('hands back the option that was picked when two read the same', async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideTranslateService()],
    });
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    host.options.set([
      { id: 'case-a', value: 'علی رضایی', label: 'علی رضایی', meta: '101' },
      { id: 'case-b', value: 'علی رضایی', label: 'علی رضایی', meta: '202' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.debugElement
      .query(By.directive(MatAutocompleteTrigger))
      .injector.get(MatAutocompleteTrigger)
      .openPanel();
    fixture.detectChanges();
    await fixture.whenStable();

    const autocomplete = fixture.debugElement
      .query(By.directive(MatAutocomplete))
      .injector.get(MatAutocomplete);
    const second = autocomplete.options.toArray()[1];
    second._selectViaInteraction();
    fixture.detectChanges();

    expect(host.picked?.id).toBe('case-b');
    expect(host.picked?.meta).toBe('202');
  });
});
