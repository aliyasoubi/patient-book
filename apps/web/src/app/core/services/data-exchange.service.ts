import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApplyReconcileResult, ReconcilePreview } from '../models/common.model';

/** One entity's approved field changes, as the apply endpoint expects them. */
export interface ApplyReconcileEntity {
  id: string;
  fields: Array<{ field: string; proposed: string | null }>;
}

export interface ApplyReconcileRequest {
  patients: ApplyReconcileEntity[];
  implants: ApplyReconcileEntity[];
  ortho: ApplyReconcileEntity[];
}

/**
 * The patient book's Excel export and guided-correction import — admin-only,
 * separate from the one-shot CLI migration tool the app was originally seeded
 * from (`apps/api/src/modules/data-exchange`).
 */
@Injectable({ providedIn: 'root' })
export class DataExchangeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/data-exchange`;

  exportWorkbook(): Observable<Blob> {
    return this.http.get(`${this.base}/export`, { responseType: 'blob' });
  }

  previewReconcile(file: File): Observable<ReconcilePreview> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ReconcilePreview>(`${this.base}/reconcile/preview`, form);
  }

  applyReconcile(payload: ApplyReconcileRequest): Observable<ApplyReconcileResult> {
    return this.http.post<ApplyReconcileResult>(`${this.base}/reconcile/apply`, payload);
  }
}
