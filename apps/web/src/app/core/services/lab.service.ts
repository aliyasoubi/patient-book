import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  Lab,
  LabBoard,
  LabCase,
  LabJaw,
  LabTripKind,
  LabWorkType,
  PageResult,
} from '../models/common.model';
import { toParams } from './http-params.util';

/** A case's own fields, and the trip it is opened with — or, on an edit, its latest trip. */
export interface LabCaseInput {
  patientId?: string | null;
  recordedName?: string;
  labId?: string;
  workTypes?: LabWorkType[];
  jaw?: LabJaw | null;
  teethFdi?: number[];
  implantBrand?: string | null;
  impressionCount?: number | null;
  analogCount?: number | null;
  notes?: string | null;
  tripKind?: LabTripKind;
  /** Jalali `yyyy/MM/dd`. */
  sentAt?: string;
  waitDays?: number;
  tripNote?: string | null;
}

/** What came back with the work: the parts too, or only the work and the days the lab has for them. */
export type LabReceiveParts =
  { partsReturned: true } | { partsReturned: false; partsWaitDays: number };

/** Back to the lab for the next step. */
export interface LabSendInput {
  kind: LabTripKind;
  sentAt?: string;
  waitDays: number;
  note?: string | null;
}

export interface LabCaseQuery {
  q?: string;
  patientId?: string;
  archivedOnly?: boolean;
  page?: number;
  limit?: number;
}

/**
 * The lab board and the lab catalogue. A case moves only through the four
 * commands — receive, send, deliver, undo — each of which the API refuses with
 * `ERR_LAB_CASE_MOVED` when someone else has moved the case first.
 */
@Injectable({ providedIn: 'root' })
export class LabService {
  private readonly http = inject(HttpClient);
  private readonly cases = `${environment.apiUrl}/lab-cases`;
  private readonly labsUrl = `${environment.apiUrl}/labs`;

  labs(): Observable<Lab[]> {
    return this.http.get<Lab[]>(this.labsUrl);
  }

  createLab(name: string): Observable<Lab> {
    return this.http.post<Lab>(this.labsUrl, { name });
  }

  updateLab(id: string, changes: { name?: string; isActive?: boolean }): Observable<Lab> {
    return this.http.patch<Lab>(`${this.labsUrl}/${id}`, changes);
  }

  board(query: { q?: string; labId?: string }): Observable<LabBoard> {
    return this.http.get<LabBoard>(`${this.cases}/board`, { params: toParams(query) });
  }

  list(query: LabCaseQuery): Observable<PageResult<LabCase>> {
    return this.http.get<PageResult<LabCase>>(this.cases, { params: toParams(query) });
  }

  get(id: string): Observable<LabCase> {
    return this.http.get<LabCase>(`${this.cases}/${id}`);
  }

  create(body: LabCaseInput): Observable<LabCase> {
    return this.http.post<LabCase>(this.cases, body);
  }

  update(id: string, body: LabCaseInput & { expectedVersion: number }): Observable<LabCase> {
    return this.http.patch<LabCase>(`${this.cases}/${id}`, body);
  }

  /** How the work came back: with its implant parts, or without them and when they are due. */
  receive(id: string, parts?: LabReceiveParts): Observable<LabCase> {
    return this.http.post<LabCase>(`${this.cases}/${id}/receive`, parts ?? {});
  }

  /** The patient is booked for the fitting on this Jalali day, or the booking moves to it. */
  book(id: string, date: string): Observable<LabCase> {
    return this.http.post<LabCase>(`${this.cases}/${id}/book`, { date });
  }

  send(id: string, body: LabSendInput): Observable<LabCase> {
    return this.http.post<LabCase>(`${this.cases}/${id}/send`, body);
  }

  deliver(id: string): Observable<LabCase> {
    return this.http.post<LabCase>(`${this.cases}/${id}/deliver`, {});
  }

  undo(id: string, expectedVersion: number): Observable<LabCase> {
    return this.http.post<LabCase>(`${this.cases}/${id}/undo`, { expectedVersion });
  }

  setPartsReturned(id: string, returned: boolean): Observable<LabCase> {
    return this.http.post<LabCase>(`${this.cases}/${id}/parts-returned`, { returned });
  }

  /** A soft delete — the case moves to the archive and can be restored. */
  archive(id: string): Observable<void> {
    return this.http.delete<void>(`${this.cases}/${id}`);
  }

  restore(id: string): Observable<LabCase> {
    return this.http.post<LabCase>(`${this.cases}/${id}/restore`, {});
  }
}
