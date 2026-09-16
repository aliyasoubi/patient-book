import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BCRYPT_COST, User } from '../src/modules/users/user.entity';
import { ErrorCode, UserRole } from '../src/domain';

/**
 * The handful of flows a clinic actually depends on, run over HTTP against a
 * real database: sign-in, the patient write path with its concurrency and
 * uniqueness rules, role enforcement, and the surgery-list identity check.
 *
 * These tests write. They run in CI (a throwaway database) or against a
 * database whose name ends in `_e2e` / `_test`; anywhere else they are skipped
 * so `npm run test:e2e` can never plant fixture rows in a clinic's records.
 * Locally:
 *
 *   createdb patient_book_e2e
 *   DB_NAME=patient_book_e2e npm run migration:run
 *   DB_NAME=patient_book_e2e npm run test:e2e
 */
const dbName = process.env.DB_NAME ?? '';
const writable = process.env.CI === 'true' || /(_e2e|_test)$/.test(dbName);
const describeIfWritable = writable ? describe : describe.skip;
if (!writable) {
  console.warn(
    `clinic-flows.e2e-spec: skipped — DB_NAME="${dbName}" is not a throwaway database (see the file header).`,
  );
}

/** Unique per run, so a re-run never collides with leftovers from a crashed one. */
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
/** Digits only, well above any real file number, unique per call. */
let counter = 0;
const nextNumber = (): string =>
  `9${Date.now()}${String(++counter).padStart(3, '0')}`;

interface ErrorBody {
  statusCode: number;
  code: string;
  fieldErrors?: Record<string, Array<{ code: string }>>;
}

describeIfWritable('clinic flows (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let adminToken: string;
  let viewerToken: string;

  const adminUsername = `e2e-admin-${runId}`;
  const viewerUsername = `e2e-viewer-${runId}`;
  // Fixture credentials for this run only; never a real account's.
  const password = `E2e!${runId}Pass`;
  const userIds: string[] = [];
  const patientIds: string[] = [];
  const implantCaseIds: string[] = [];
  const surgeryIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) =>
    req.set('Authorization', `Bearer ${adminToken}`);
  const asViewer = (req: request.Test) =>
    req.set('Authorization', `Bearer ${viewerToken}`);

  async function login(username: string): Promise<string> {
    const res = await http()
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);

    const users = db.getRepository(User);
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    for (const [username, role] of [
      [adminUsername, UserRole.Admin],
      [viewerUsername, UserRole.Viewer],
    ] as const) {
      const saved = await users.save(
        users.create({
          username,
          passwordHash,
          fullName: `e2e ${role}`,
          role,
          isActive: true,
          mustChangePassword: false,
        }),
      );
      userIds.push(saved.id);
    }

    adminToken = await login(adminUsername);
    viewerToken = await login(viewerUsername);
  });

  afterAll(async () => {
    // Children before parents; the FKs would only null out, but leaving
    // fixture rows behind is what this block exists to prevent.
    if (surgeryIds.length) {
      await db.query(`DELETE FROM surgery_queue WHERE id = ANY($1)`, [
        surgeryIds,
      ]);
    }
    if (implantCaseIds.length) {
      await db.query(`DELETE FROM implant_cases WHERE id = ANY($1)`, [
        implantCaseIds,
      ]);
    }
    if (patientIds.length) {
      await db.query(
        `DELETE FROM patient_treatments WHERE "patientId" = ANY($1)`,
        [patientIds],
      );
      await db.query(`DELETE FROM patients WHERE id = ANY($1)`, [patientIds]);
    }
    if (userIds.length) {
      await db.query(`DELETE FROM audit_logs WHERE "userId" = ANY($1)`, [
        userIds,
      ]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
    await app.close();
  });

  // ── Sign-in ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('refuses a wrong password with one fixed code and no token', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ username: adminUsername, password: `${password}-wrong` })
        .expect(401);

      expect((res.body as ErrorBody).code).toBe(ErrorCode.InvalidCredentials);
      expect(res.body).not.toHaveProperty('accessToken');
    });

    it('issues a token that identifies the user, and refuses requests without one', async () => {
      const me = await asAdmin(http().get('/api/auth/me')).expect(200);
      expect(me.body).toMatchObject({
        username: adminUsername,
        role: UserRole.Admin,
      });

      const anonymous = await http().get('/api/auth/me').expect(401);
      expect((anonymous.body as ErrorBody).code).toBe(ErrorCode.Unauthorized);
    });
  });

  // ── Patient write path ───────────────────────────────────────────

  describe('patients', () => {
    it('creates a patient and reads it back, with identifiers stored as ASCII digits', async () => {
      // Typed on a Persian keyboard: the file number and mobile arrive as
      // Persian digits and must be stored — and searchable — as Latin ones.
      const fileNo = nextNumber();
      const persianFileNo = fileNo.replace(/\d/g, (d) =>
        String.fromCharCode(0x06f0 + Number(d)),
      );

      const created = await asAdmin(http().post('/api/patients'))
        .send({
          fileNo: persianFileNo,
          firstName: 'مریم',
          lastName: 'کریمی',
          mobile: '۰۹۱۲۱۲۳۴۵۶۷',
          nationalId: '۰۰۷۸۹۸۰۵۰۱',
        })
        .expect(201);
      const body = created.body as {
        id: string;
        fileNo: string;
        mobile: string;
        nationalId: string;
        version: number;
      };
      patientIds.push(body.id);

      expect(body).toMatchObject({
        fileNo,
        mobile: '09121234567',
        nationalId: '0078980501',
      });
      expect(body.version).toBe(1);

      const fetched = await asAdmin(
        http().get(`/api/patients/${body.id}`),
      ).expect(200);
      expect(fetched.body).toMatchObject({
        id: body.id,
        fileNo,
        fullName: 'مریم کریمی',
      });

      const byFileNo = await asAdmin(
        http().get(`/api/patients/by-file-no/${fileNo}`),
      ).expect(200);
      expect((byFileNo.body as { id: string }).id).toBe(body.id);
    });

    it('refuses a duplicate file number with its own code', async () => {
      const fileNo = nextNumber();
      const first = await asAdmin(http().post('/api/patients'))
        .send({ fileNo, firstName: 'رضا', lastName: 'احمدی' })
        .expect(201);
      patientIds.push((first.body as { id: string }).id);

      const second = await asAdmin(http().post('/api/patients'))
        .send({ fileNo, firstName: 'رضا', lastName: 'احمدی' })
        .expect(409);
      expect((second.body as ErrorBody).code).toBe(ErrorCode.FileNumberTaken);
    });

    it('lets exactly one of two simultaneous creates with the same file number through', async () => {
      // Both requests can pass the service-level check before either commits;
      // the unique index then rejects the loser, and the client must get the
      // same answer it would have got from the check.
      const fileNo = nextNumber();
      const attempt = () =>
        asAdmin(http().post('/api/patients')).send({
          fileNo,
          firstName: 'زهرا',
          lastName: 'موسوی',
        });
      const results = await Promise.all([attempt(), attempt()]);

      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const winner = results.find((r) => r.status === 201)!;
      const loser = results.find((r) => r.status === 409)!;
      patientIds.push((winner.body as { id: string }).id);
      expect((loser.body as ErrorBody).code).toBe(ErrorCode.FileNumberTaken);
    });

    it('refuses a save made from a stale copy, and requires a version at all', async () => {
      const created = await asAdmin(http().post('/api/patients'))
        .send({ fileNo: nextNumber(), firstName: 'سارا', lastName: 'رضایی' })
        .expect(201);
      const { id, version } = created.body as { id: string; version: number };
      patientIds.push(id);

      // First editor saves from the version they loaded.
      const saved = await asAdmin(http().patch(`/api/patients/${id}`))
        .send({ occupation: 'معلم', expectedVersion: version })
        .expect(200);
      expect((saved.body as { version: number }).version).toBe(version + 1);

      // Second editor still holds the old copy: refused, nothing overwritten.
      const stale = await asAdmin(http().patch(`/api/patients/${id}`))
        .send({ occupation: 'پرستار', expectedVersion: version })
        .expect(409);
      expect((stale.body as ErrorBody).code).toBe(ErrorCode.PatientModified);

      const current = await asAdmin(http().get(`/api/patients/${id}`)).expect(
        200,
      );
      expect((current.body as { occupation: string }).occupation).toBe('معلم');

      // A client that sends no version has not read what it would overwrite.
      const missing = await asAdmin(http().patch(`/api/patients/${id}`))
        .send({ occupation: 'پرستار' })
        .expect(400);
      expect((missing.body as ErrorBody).fieldErrors).toHaveProperty(
        'expectedVersion',
      );
    });

    it('keeps a viewer read-only', async () => {
      const created = await asAdmin(http().post('/api/patients'))
        .send({ fileNo: nextNumber(), firstName: 'علی', lastName: 'حسینی' })
        .expect(201);
      const { id, version } = created.body as { id: string; version: number };
      patientIds.push(id);

      await asViewer(http().get(`/api/patients/${id}`)).expect(200);

      const patch = await asViewer(http().patch(`/api/patients/${id}`))
        .send({ occupation: 'مهندس', expectedVersion: version })
        .expect(403);
      expect((patch.body as ErrorBody).code).toBe(ErrorCode.Forbidden);

      const post = await asViewer(http().post('/api/patients'))
        .send({ fileNo: nextNumber(), firstName: 'علی', lastName: 'حسینی' })
        .expect(403);
      expect((post.body as ErrorBody).code).toBe(ErrorCode.Forbidden);

      const unchanged = await asAdmin(http().get(`/api/patients/${id}`)).expect(
        200,
      );
      expect(
        (unchanged.body as { occupation: string | null }).occupation,
      ).toBeNull();
    });
  });

  // ── Surgery list identity check ──────────────────────────────────

  describe('surgery queue', () => {
    it('flags a row whose name disagrees with the implant register for that number', async () => {
      const registryNo = nextNumber();
      const implantCase = await asAdmin(http().post('/api/implant-cases'))
        .send({ registryNo, recordedName: 'مریم کریمی' })
        .expect(201);
      implantCaseIds.push((implantCase.body as { id: string }).id);

      // Same number, different person: a reused register number is exactly
      // the mistake the list must surface before anyone is prepped.
      const mismatched = await asAdmin(http().post('/api/surgery-queue'))
        .send({ recordedName: 'رضا احمدی', implantRegistryNo: registryNo })
        .expect(201);
      surgeryIds.push((mismatched.body as { id: string }).id);
      expect(mismatched.body).toMatchObject({
        hasNameMismatch: true,
        registeredName: 'مریم کریمی',
        implantRegistryNo: registryNo,
      });

      const matching = await asAdmin(http().post('/api/surgery-queue'))
        .send({ recordedName: 'مریم کریمی', implantRegistryNo: registryNo })
        .expect(201);
      surgeryIds.push((matching.body as { id: string }).id);
      expect(
        (matching.body as { hasNameMismatch: boolean }).hasNameMismatch,
      ).toBe(false);
    });
  });
});
