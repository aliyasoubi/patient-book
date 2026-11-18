import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { APP_VERSION_HEADER, AppVersion } from '../version/app-version';
import { versionInterceptor } from './version.interceptor';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([versionInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    version: TestBed.inject(AppVersion),
  };
}

describe('versionInterceptor', () => {
  it('notices another release in a reply', () => {
    const { http, backend, version } = setup();
    http.get('/api/patients').subscribe();
    backend.expectOne('/api/patients').flush([], { headers: { [APP_VERSION_HEADER]: 'v1.5.0' } });
    expect(version.updateReady()).toBe(true);
  });

  it('notices it in a failed reply too', () => {
    const { http, backend, version } = setup();
    http.get('/api/patients').subscribe({ error: () => undefined });
    backend.expectOne('/api/patients').flush(
      { code: 'ERR_VALIDATION_FAILED' },
      {
        status: 400,
        statusText: 'Bad Request',
        headers: { [APP_VERSION_HEADER]: 'v1.5.0' },
      },
    );
    expect(version.updateReady()).toBe(true);
  });

  it('stays quiet for a reply without the header', () => {
    const { http, backend, version } = setup();
    http.get('/api/health').subscribe();
    backend.expectOne('/api/health').flush({ status: 'ok' });
    expect(version.updateReady()).toBe(false);
  });
});
