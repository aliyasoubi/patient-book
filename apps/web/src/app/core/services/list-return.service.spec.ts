import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AuthService } from './auth.service';
import { ListReturn } from './list-return.service';

function setup() {
  const user = signal<{ id: string } | null>({ id: 'u1' });
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: { user } }],
  });
  const service = TestBed.inject(ListReturn);
  TestBed.tick();
  return { service, user };
}

describe('ListReturn', () => {
  it('falls back to the bare list until the list has been shown', () => {
    const { service } = setup();
    expect(service.urlFor('/surgery')).toBe('/surgery');
  });

  it('hands back the URL the list was left at', () => {
    const { service } = setup();
    service.remember('/surgery', '/surgery?followUp=overdue&page=2');
    expect(service.urlFor('/surgery')).toBe('/surgery?followUp=overdue&page=2');
  });

  it('keeps only a URL under the list’s own path', () => {
    const { service } = setup();
    service.remember('/labs', '/patients?q=x');
    service.remember('/labs', '/labsfoo');
    expect(service.urlFor('/labs')).toBe('/labs');
  });

  it('keeps the URLs through a token refresh, drops them when the person changes', () => {
    const { service, user } = setup();
    service.remember('/labs', '/labs?q=test');
    user.set({ id: 'u1' });
    TestBed.tick();
    expect(service.urlFor('/labs')).toBe('/labs?q=test');
    user.set(null);
    TestBed.tick();
    expect(service.urlFor('/labs')).toBe('/labs');
  });
});
