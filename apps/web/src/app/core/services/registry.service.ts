import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  DashboardStats,
  PageResult,
  RegistryCase,
  SurgeryQueueItem,
  UpcomingSurgery,
} from '../models/common.model';
import { toParams } from './http-params.util';

export interface RegistryQuery {
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  status?: string;
  unlinkedOnly?: boolean;
  archivedOnly?: boolean;
}

export interface SurgeryQuery extends Omit<RegistryQuery, 'unlinkedOnly'> {
  mismatchedOnly?: boolean;
  from?: string;
  to?: string;
}

/** The two registers share one shape and one set of endpoints; this picks which. */
export type RegistryKind = 'implant' | 'ortho';

/** What a register case's create/edit form sends; everything else is derived server-side. */
export type RegistryCaseInput = Partial<
  Pick<
    RegistryCase,
    'registryNo' | 'recordedName' | 'patientId' | 'mobile' | 'homePhone' | 'status' | 'notes'
  >
>;

/**
 * The implant and orthodontic registers. Both number themselves independently
 * of the main patient file, so `registryNo` is their own key and `patientId` is
 * a separate, editable link.
 */
@Injectable({ providedIn: 'root' })
export class RegistryService {
  private readonly http = inject(HttpClient);

  private base(kind: RegistryKind): string {
    return `${environment.apiUrl}/${kind === 'implant' ? 'implant-cases' : 'ortho-cases'}`;
  }

  cases(kind: RegistryKind, query: RegistryQuery): Observable<PageResult<RegistryCase>> {
    return this.http.get<PageResult<RegistryCase>>(this.base(kind), {
      params: toParams(query),
    });
  }

  implants(query: RegistryQuery): Observable<PageResult<RegistryCase>> {
    return this.cases('implant', query);
  }

  getCase(kind: RegistryKind, id: string): Observable<RegistryCase> {
    return this.http.get<RegistryCase>(`${this.base(kind)}/${id}`);
  }

  saveCase(kind: RegistryKind, id: string | null, body: RegistryCaseInput): Observable<RegistryCase> {
    return id
      ? this.http.patch<RegistryCase>(`${this.base(kind)}/${id}`, body)
      : this.http.post<RegistryCase>(this.base(kind), body);
  }

  /** A soft delete on the API — the row moves to "archived only" and can be restored. */
  deleteCase(kind: RegistryKind, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(kind)}/${id}`);
  }

  restoreCase(kind: RegistryKind, id: string): Observable<RegistryCase> {
    return this.http.post<RegistryCase>(`${this.base(kind)}/${id}/restore`, {});
  }

  surgeryQueue(query: SurgeryQuery): Observable<PageResult<SurgeryQueueItem>> {
    return this.http.get<PageResult<SurgeryQueueItem>>(`${environment.apiUrl}/surgery-queue`, {
      params: toParams(query),
    });
  }

  getSurgery(id: string): Observable<SurgeryQueueItem> {
    return this.http.get<SurgeryQueueItem>(`${environment.apiUrl}/surgery-queue/${id}`);
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

  restoreSurgery(id: string): Observable<SurgeryQueueItem> {
    return this.http.post<SurgeryQueueItem>(`${environment.apiUrl}/surgery-queue/${id}/restore`, {});
  }

  dashboard(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${environment.apiUrl}/stats/dashboard`);
  }

  upcomingSurgeries(): Observable<UpcomingSurgery[]> {
    return this.http.get<UpcomingSurgery[]>(`${environment.apiUrl}/stats/upcoming-surgeries`);
  }
}
