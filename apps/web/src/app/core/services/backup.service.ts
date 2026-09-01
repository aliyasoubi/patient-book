import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface BackupSettings {
  dir: string;
  isDefault: boolean;
  lastSuccess: string | null;
  lastDrill: string | null;
}

/** Reads and updates where the nightly database backup is written. Admin-only. */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly http = inject(HttpClient);

  settings(): Observable<BackupSettings> {
    return this.http.get<BackupSettings>(`${environment.apiUrl}/backup/settings`);
  }

  setDir(dir: string): Observable<BackupSettings> {
    return this.http.put<BackupSettings>(`${environment.apiUrl}/backup/settings`, { dir });
  }
}
