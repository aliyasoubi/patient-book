import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { toParams } from '../../../core/services/http-params.util';
import { AuditEntry, PageResult } from '../../../core/models/common.model';
import { NameSuggestion, Patient, PatientInput, PatientSuggestion, ReferralSource, TreatmentType } from './patient.model';

export interface PatientQuery {
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  gender?: string;
  education?: string;
  treatments?: string[];
  referralSourceId?: string;
  hasIssues?: boolean;
  hasMedicalHistory?: boolean;
  inactiveMonths?: number;
  lastVisitFrom?: string;
  lastVisitTo?: string;
  includeArchived?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/patients`;

  list(query: PatientQuery): Observable<PageResult<Patient>> {
    return this.http.get<PageResult<Patient>>(this.base, { params: toParams(query) });
  }

  get(id: string): Observable<Patient> {
    return this.http.get<Patient>(`${this.base}/${id}`);
  }

  suggest(q: string): Observable<PatientSuggestion[]> {
    return this.http.get<PatientSuggestion[]>(`${this.base}/suggest`, { params: { q } });
  }

  nextFileNo(): Observable<{ fileNo: string }> {
    return this.http.get<{ fileNo: string }>(`${this.base}/next-file-no`);
  }

  nameSuggestions(field: 'firstName' | 'lastName'): Observable<NameSuggestion[]> {
    return this.http.get<NameSuggestion[]>(`${this.base}/name-suggestions`, { params: { field } });
  }

  create(input: PatientInput): Observable<Patient> {
    return this.http.post<Patient>(this.base, input);
  }

  update(id: string, input: Partial<PatientInput>): Observable<Patient> {
    return this.http.patch<Patient>(`${this.base}/${id}`, input);
  }

  archive(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  restore(id: string): Observable<Patient> {
    return this.http.post<Patient>(`${this.base}/${id}/restore`, {});
  }

  /** Mark a flagged import warning as checked. */
  resolveIssue(id: string, field: string): Observable<Patient> {
    return this.http.patch<Patient>(`${this.base}/${id}/resolve-issue/${field}`, {});
  }

  history(id: string): Observable<AuditEntry[]> {
    return this.http.get<AuditEntry[]>(`${this.base}/${id}/history`);
  }

  treatmentTypes(): Observable<TreatmentType[]> {
    return this.http.get<TreatmentType[]>(`${environment.apiUrl}/treatment-types`);
  }

  referralSources(q?: string): Observable<ReferralSource[]> {
    return this.http.get<ReferralSource[]>(`${environment.apiUrl}/referral-sources`, {
      params: q ? { q } : {},
    });
  }
}
