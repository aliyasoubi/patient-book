import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../../../core/models/common.model';
import { AuthService } from '../../../core/services/auth.service';
import { RecentPatientsService } from './recent-patients.service';

const user = (id: string) => ({ id }) as AuthUser;
const patient = (n: number) => ({ id: `p${n}`, fileNo: String(1000 + n), fullName: `بیمار ${n}` });

describe('RecentPatientsService', () => {
  function setup(signedIn: AuthUser | null = user('u1')) {
    const current = signal<AuthUser | null>(signedIn);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: current.asReadonly() } }],
    });
    const recent = TestBed.inject(RecentPatientsService);
    TestBed.flushEffects();
    return { recent, current };
  }

  afterEach(() => sessionStorage.clear());

  it('keeps the last five, newest first, each once', () => {
    const { recent } = setup();
    for (const n of [1, 2, 3, 4, 5, 6]) recent.record(patient(n));
    recent.record(patient(4));

    expect(recent.items().map((p) => p.id)).toEqual(['p4', 'p6', 'p5', 'p3', 'p2']);
  });

  it('survives a reload of the same session', () => {
    setup().recent.record(patient(1));
    TestBed.resetTestingModule();

    expect(
      setup()
        .recent.items()
        .map((p) => p.id),
    ).toEqual(['p1']);
  });

  it('is dropped on sign-out and never shown to the next user', () => {
    const { recent, current } = setup();
    recent.record(patient(1));

    current.set(null);
    TestBed.flushEffects();
    expect(recent.items()).toEqual([]);
    expect(sessionStorage.length).toBe(0);

    current.set(user('u2'));
    TestBed.flushEffects();
    expect(recent.items()).toEqual([]);
  });

  it('keeps nothing clinical, whatever it is handed', () => {
    const { recent } = setup();
    recent.record({ ...patient(1), medicalHistory: 'آلرژی' } as ReturnType<typeof patient>);

    expect(sessionStorage.getItem('pb.recentPatients.u1')).not.toContain('آلرژی');
  });
});
