import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { DashboardStats, PageResult, RegistryCase, SurgeryQueueItem } from '../models/common.model';
import { toParams } from './http-params.util';

export interface RegistryQuery {
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  status?: string;
  unlinkedOnly?: boolean;
}

export interface SurgeryQuery extends Omit<RegistryQuery, 'unlinkedOnly'> {
  mismatchedOnly?: boolean;
  from?: string;
  to?: string;
}

/**
 * The implant and orthodontic registers. Both number themselves independently
 * of the main patient file, so `registryNo` is their own key and `patientId` is
 * a separate, editable link.
 */
@Injectable({ providedIn: 'root' })
export class RegistryService {
  private readonly http = inject(HttpClient);

  implants(query: RegistryQuery): Observable<PageResult<RegistryCase>> {
    return this.http.get<PageResult<RegistryCase>>(`${environment.apiUrl}/implant-cases`, {
      params: toParams(query),
    });
  }

  ortho(query: RegistryQuery): Observable<PageResult<RegistryCase>> {
    return this.http.get<PageResult<RegistryCase>>(`${environment.apiUrl}/ortho-cases`, {
      params: toParams(query),
    });
  }

  saveImplant(id: string | null, body: Partial<RegistryCase>): Observable<RegistryCase> {
    const url = `${environment.apiUrl}/implant-cases`;
    return id
      ? this.http.patch<RegistryCase>(`${url}/${id}`, body)
      : this.http.post<RegistryCase>(url, body);
  }

  saveOrtho(id: string | null, body: Partial<RegistryCase>): Observable<RegistryCase> {
    const url = `${environment.apiUrl}/ortho-cases`;
    return id
      ? this.http.patch<RegistryCase>(`${url}/${id}`, body)
      : this.http.post<RegistryCase>(url, body);
  }

  deleteImplant(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/implant-cases/${id}`);
  }

  deleteOrtho(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/ortho-cases/${id}`);
  }

  surgeryQueue(query: SurgeryQuery): Observable<PageResult<SurgeryQueueItem>> {
    return this.http.get<PageResult<SurgeryQueueItem>>(`${environment.apiUrl}/surgery-queue`, {
      params: toParams(query),
    });
  }

  saveSurgery(id: string | null, body: Record<string, unknown>): Observable<SurgeryQueueItem> {
    const url = `${environment.apiUrl}/surgery-queue`;
    return id
      ? this.http.patch<SurgeryQueueItem>(`${url}/${id}`, body)
      : this.http.post<SurgeryQueueItem>(url, body);
  }

  deleteSurgery(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/surgery-queue/${id}`);
  }

  dashboard(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${environment.apiUrl}/stats/dashboard`);
  }
}
