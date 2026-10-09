import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  InventoryCategory,
  InventoryFilter,
  InventoryItem,
  InventoryItemDetail,
  InventoryMovementKind,
  InventoryUnit,
} from '../models/common.model';
import { toParams } from './http-params.util';

/** An item's own fields. Its quantity is set once, on creation, as the first count. */
export interface InventoryItemInput {
  category?: InventoryCategory;
  name?: string;
  brand?: string | null;
  spec?: string | null;
  unit?: InventoryUnit;
  minQuantity?: number | null;
  /** As printed on the pack; the API reads Gregorian and Jalali. */
  expiry?: string | null;
  notes?: string | null;
  /** On creation only: what is on the shelf, as the first batch. */
  quantity?: number;
  lotNumber?: string | null;
}

export interface InventoryMovementInput {
  kind: InventoryMovementKind;
  /** How many came in or went out — or, for a count, how many are on the shelf. */
  quantity: number;
  /** A delivery's packs. */
  expiry?: string | null;
  lotNumber?: string | null;
  /** A use's or discard's batch; first-expiring first when absent. */
  lotId?: string | null;
  /** The patient a use went into. */
  patientFileNo?: string | null;
  note?: string | null;
}

/** One item of a stocktake; only what changed is sent. */
export interface InventoryCountLine {
  id: string;
  quantity?: number;
  /** `null` stops reordering it by level. */
  minQuantity?: number | null;
}

export interface InventoryQuery {
  q?: string;
  category?: InventoryCategory;
  filter?: InventoryFilter;
  archivedOnly?: boolean;
}

/**
 * The clinic's stock. An item's quantity moves only through {@link move},
 * which the API refuses with `ERR_INVENTORY_INSUFFICIENT_STOCK` when more is
 * taken out than is on the shelf.
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly items = `${environment.apiUrl}/inventory/items`;

  /** The whole shelf, or what the query narrows it to — never paged, in shelf order. */
  list(query: InventoryQuery): Observable<InventoryItem[]> {
    return this.http.get<InventoryItem[]>(this.items, { params: toParams(query) });
  }

  /** Brands to suggest: the standard list, as it spells them, and those in stock. */
  brands(): Observable<{ name: string; spellings: string[] }[]> {
    return this.http.get<{ name: string; spellings: string[] }[]>(`${this.items}/brands`);
  }

  /** One item with its stock card, newest first. */
  get(id: string): Observable<InventoryItemDetail> {
    return this.http.get<InventoryItemDetail>(`${this.items}/${id}`);
  }

  create(body: InventoryItemInput): Observable<InventoryItemDetail> {
    return this.http.post<InventoryItemDetail>(this.items, body);
  }

  update(
    id: string,
    body: InventoryItemInput & { expectedVersion: number },
  ): Observable<InventoryItemDetail> {
    return this.http.patch<InventoryItemDetail>(`${this.items}/${id}`, body);
  }

  move(id: string, body: InventoryMovementInput): Observable<InventoryItemDetail> {
    return this.http.post<InventoryItemDetail>(`${this.items}/${id}/movements`, body);
  }

  /** A shelf counted at once, saved whole or not at all. */
  count(lines: InventoryCountLine[]): Observable<{ counted: number; minimums: number }> {
    return this.http.post<{ counted: number; minimums: number }>(`${this.items}/count`, {
      lines,
    });
  }

  /** Correct a batch's lot number or expiry. */
  updateLot(
    id: string,
    lotId: string,
    body: { lotNumber?: string | null; expiry?: string | null },
  ): Observable<InventoryItemDetail> {
    return this.http.patch<InventoryItemDetail>(`${this.items}/${id}/lots/${lotId}`, body);
  }

  /** A soft delete: the item leaves the list and can be restored. */
  archive(id: string): Observable<void> {
    return this.http.delete<void>(`${this.items}/${id}`);
  }

  restore(id: string): Observable<InventoryItemDetail> {
    return this.http.post<InventoryItemDetail>(`${this.items}/${id}/restore`, {});
  }
}
