import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Tariff } from '../models/common.model';

/** A service's own fields; prices in rials. */
export interface TariffInput {
  category?: string;
  title?: string;
  price?: number | null;
  maxPrice?: number | null;
  note?: string | null;
}

/**
 * The price list for the clinic's services. What items sold to patients go
 * for is not here: it is each item's `salePrice`, kept by {@link InventoryService}.
 */
@Injectable({ providedIn: 'root' })
export class TariffsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/tariffs`;

  /** Every line, in the practice's own order. */
  list(): Observable<Tariff[]> {
    return this.http.get<Tariff[]>(this.url);
  }

  create(body: TariffInput): Observable<Tariff> {
    return this.http.post<Tariff>(this.url, body);
  }

  update(id: string, body: TariffInput & { expectedVersion: number }): Observable<Tariff> {
    return this.http.patch<Tariff>(`${this.url}/${id}`, body);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
