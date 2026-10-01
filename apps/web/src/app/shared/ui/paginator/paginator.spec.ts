import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatPaginator, type PageEvent } from '@angular/material/paginator';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { PbPaginator } from './paginator';

@Component({
  standalone: true,
  imports: [PbPaginator],
  template: `<pb-paginator
    [length]="95"
    [page]="page()"
    [pageSize]="25"
    (pageChange)="last = $event"
  />`,
})
class Host {
  readonly page = signal(2);
  last: PageEvent | null = null;
}

describe('PbPaginator', () => {
  it('maps the 1-based page onto Material’s 0-based index and passes changes through', () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const paginator = fixture.debugElement.query(By.directive(MatPaginator))
      .componentInstance as MatPaginator;
    expect(paginator.pageIndex).toBe(1);
    expect(paginator.pageSizeOptions).toEqual([10, 25, 50, 100]);

    paginator.nextPage();
    expect(fixture.componentInstance.last?.pageIndex).toBe(2);
  });
});
