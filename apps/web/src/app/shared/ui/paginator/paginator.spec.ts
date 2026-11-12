import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PageEvent } from '@angular/material/paginator';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { formatPersianNumber } from '../../pipes/persian-number.pipe';
import { PbPaginator } from './paginator';

@Component({
  standalone: true,
  imports: [PbPaginator],
  template: `<pb-paginator
    [length]="length()"
    [page]="page()"
    [pageSize]="25"
    (pageChange)="last = $event"
  />`,
})
class Host {
  readonly length = signal(95);
  readonly page = signal(2);
  last: PageEvent | null = null;
}

function setup(length: number, page: number) {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.length.set(length);
  fixture.componentInstance.page.set(page);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const pages = () =>
    [...el.querySelectorAll('.pager__page, .pager__gap')].map((b) => b.textContent!.trim());
  return { fixture, el, pages };
}

describe('PbPaginator', () => {
  it('marks the current page and emits 0-based moves, as the lists expect', () => {
    const { fixture, el } = setup(95, 2);
    expect(el.querySelector('.pager__page.is-current')?.getAttribute('aria-current')).toBe('page');

    const [, next] = el.querySelectorAll<HTMLButtonElement>('.pager__step');
    next.click();
    expect(fixture.componentInstance.last).toMatchObject({ pageIndex: 2, pageSize: 25 });
  });

  it('keeps the first, last and neighbouring pages, and folds the rest into a gap', () => {
    const { pages } = setup(25 * 13, 7);
    const fa = (n: number) => formatPersianNumber(n);
    expect(pages()).toEqual([fa(1), '…', fa(6), fa(7), fa(8), '…', fa(13)]);
  });

  it('starts again from the first page when the page size changes', () => {
    const { fixture, el } = setup(95, 3);
    const sizes = el.querySelectorAll<HTMLButtonElement>('.pager__size-option');
    expect(sizes.length).toBe(4);
    sizes[2].click();
    expect(fixture.componentInstance.last).toMatchObject({ pageIndex: 0, pageSize: 50 });
  });
});
