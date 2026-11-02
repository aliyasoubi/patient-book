import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '../../core/models/common.model';
import { InventoryService } from '../../core/services/inventory.service';
import { InventoryCount } from './inventory-count';

const item = (id: string, name: string): InventoryItem =>
  ({ id, name, brand: null, spec: null, quantity: 3, minQuantity: null }) as InventoryItem;

describe('InventoryCount', () => {
  it('keeps the shelf picked last when the one before it answers late', () => {
    const shelves = new Map<string, Subject<InventoryItem[]>>();
    TestBed.configureTestingModule({
      imports: [InventoryCount],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        {
          provide: InventoryService,
          useValue: {
            list: ({ category }: { category: string }) => {
              const shelf = new Subject<InventoryItem[]>();
              shelves.set(category, shelf);
              return shelf;
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(InventoryCount);
    fixture.detectChanges();
    const sheet = fixture.componentInstance as unknown as {
      categoryControl: { setValue(value: string): void };
    };

    // Implants still on their way when someone switches to anaesthetics.
    sheet.categoryControl.setValue('anesthesia');
    shelves.get('anesthesia')!.next([item('b', 'Lidocaine')]);
    shelves.get('implant')!.next([item('a', 'Implant 4x10')]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Lidocaine');
    expect(text).not.toContain('Implant 4x10');
  });
});
