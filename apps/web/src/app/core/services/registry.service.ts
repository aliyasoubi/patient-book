import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  DashboardSummary,
  FollowUpDue,
  FollowUpFilter,
  PageResult,
  PracticeStats,
  RegistryCase,
  SurgeryQueueItem,
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
  /** Open follow-ups within a window; the API decides the dates. */
  followUp?: FollowUpFilter;
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

/** An edit also names the version it was made from; the API refuses a stale one. */
export type RegistryCaseUpdate = RegistryCaseInput & { expectedVersion: number };

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

  createCase(kind: RegistryKind, body: RegistryCaseInput): Observable<RegistryCase> {
    return this.http.post<RegistryCase>(this.base(kind), body);
  }

  updateCase(kind: RegistryKind, id: string, body: RegistryCaseUpdate): Observable<RegistryCase> {
    return this.http.patch<RegistryCase>(`${this.base(kind)}/${id}`, body);
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

  /** The dashboard's work counts — what needs attention, not how the practice looks. */
  dashboard(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${environment.apiUrl}/stats/dashboard`);
  }

  /** Totals and breakdowns for the statistics page. */
  practiceStats(): Observable<PracticeStats> {
    return this.http.get<PracticeStats>(`${environment.apiUrl}/stats/overview`);
  }

  /** The coming week's open follow-ups, soonest first. */
  followUpsThisWeek(): Observable<FollowUpDue[]> {
    return this.http.get<FollowUpDue[]>(`${environment.apiUrl}/stats/follow-ups`);
  }

  /** The implant book's next unused number, offered when a surgery row is added. */
  nextRegistryNo(): Observable<{ registryNo: string }> {
    return this.http.get<{ registryNo: string }>(
      `${environment.apiUrl}/surgery-queue/next-registry-no`,
    );
  }
}
