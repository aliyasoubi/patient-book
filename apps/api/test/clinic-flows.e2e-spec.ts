import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { addMonths, format as formatJalali } from 'date-fns-jalali';

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

  // ── Registers ────────────────────────────────────────────────────

  describe('implant register', () => {
    it('edits, archives and restores a case through the same audited path', async () => {
      const registryNo = nextNumber();
      const created = await asAdmin(http().post('/api/implant-cases'))
        .send({ registryNo, recordedName: 'زهرا موسوی' })
        .expect(201);
      const { id } = created.body as { id: string };
      implantCaseIds.push(id);

      // Correct the name and status; the register number stays the key.
      const edited = await asAdmin(http().patch(`/api/implant-cases/${id}`))
        .send({ recordedName: 'زهرا موسوی‌نژاد', status: 'completed' })
        .expect(200);
      expect(edited.body).toMatchObject({
        registryNo,
        recordedName: 'زهرا موسوی‌نژاد',
        status: 'completed',
      });

      // Archive is a soft delete: gone from the register, listed under
      // "archived only", and restorable without losing anything.
      await asAdmin(http().delete(`/api/implant-cases/${id}`)).expect(204);
      const gone = await asAdmin(http().get(`/api/implant-cases/${id}`)).expect(
        404,
      );
      expect((gone.body as ErrorBody).code).toBe(
        ErrorCode.RegistryCaseNotFound,
      );

      const archived = await asAdmin(
        http()
          .get('/api/implant-cases')
          .query({ archivedOnly: 'true', q: registryNo }),
      ).expect(200);
      expect((archived.body as { items: Array<{ id: string }> }).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id })]),
      );

      const restored = await asAdmin(
        http().post(`/api/implant-cases/${id}/restore`),
      ).expect(201);
      expect(restored.body).toMatchObject({
        id,
        recordedName: 'زهرا موسوی‌نژاد',
      });
      await asAdmin(http().get(`/api/implant-cases/${id}`)).expect(200);
    });

    it('keeps a non-clinical role out of archive and restore', async () => {
      // Only a dentist or admin takes an entry out of the register; the
      // viewer fixture stands in for every role below that.
      const created = await asAdmin(http().post('/api/implant-cases'))
        .send({ registryNo: nextNumber(), recordedName: 'رضا' })
        .expect(201);
      const { id } = created.body as { id: string };
      implantCaseIds.push(id);

      const denied = await asViewer(
        http().delete(`/api/implant-cases/${id}`),
      ).expect(403);
      expect((denied.body as ErrorBody).code).toBe(ErrorCode.Forbidden);
    });
  });

  // ── Dashboard ────────────────────────────────────────────────────

  describe('dashboard', () => {
    type Totals = {
      totals: { implantCases: number; followUpsThisWeek: number };
    };
    const totals = async (): Promise<Totals['totals']> =>
      (
        (await asAdmin(http().get('/api/stats/dashboard')).expect(200))
          .body as Totals
      ).totals;

    it('counts only active register cases and open follow-ups', async () => {
      // Archived is not deleted, so the raw-SQL counts have to exclude
      // `deletedAt` themselves — TypeORM's soft-delete filter does not reach
      // a hand-written query.
      const before = await totals();

      const implant = await asAdmin(http().post('/api/implant-cases'))
        .send({ registryNo: nextNumber(), recordedName: 'سارا رضایی' })
        .expect(201);
      const implantId = (implant.body as { id: string }).id;
      implantCaseIds.push(implantId);

      // A surgery three months ago with the default follow-up: due now.
      const surgery = await asAdmin(http().post('/api/surgery-queue'))
        .send({
          recordedName: 'سارا رضایی',
          surgeryDate: formatJalali(addMonths(new Date(), -3), 'yyyy/MM/dd'),
          followUpMonths: 3,
        })
        .expect(201);
      const surgeryId = (surgery.body as { id: string }).id;
      surgeryIds.push(surgeryId);

      const added = await totals();
      expect(added.implantCases).toBe(before.implantCases + 1);
      expect(added.followUpsThisWeek).toBe(before.followUpsThisWeek + 1);

      await asAdmin(http().delete(`/api/implant-cases/${implantId}`)).expect(
        204,
      );
      await asAdmin(http().delete(`/api/surgery-queue/${surgeryId}`)).expect(
        204,
      );

      const archived = await totals();
      expect(archived.implantCases).toBe(before.implantCases);
      expect(archived.followUpsThisWeek).toBe(before.followUpsThisWeek);
    });

    it("lists the coming week's follow-ups by name, soonest first", async () => {
      const surgery = await asAdmin(http().post('/api/surgery-queue'))
        .send({
          recordedName: 'لیلا حسینی',
          surgeryDate: formatJalali(addMonths(new Date(), -2), 'yyyy/MM/dd'),
          followUpMonths: 2,
        })
        .expect(201);
      const { id } = surgery.body as { id: string };
      surgeryIds.push(id);

      const panel = await asAdmin(http().get('/api/stats/follow-ups')).expect(
        200,
      );
      const rows = panel.body as Array<{
        id: string;
        recordedName: string;
        followUpState: string;
      }>;
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id,
            recordedName: 'لیلا حسینی',
            followUpState: 'due',
          }),
        ]),
      );
    });

    it('buckets new patients by Jalali month, not Gregorian', async () => {
      // 22 and 23 September 2025 are the last day of Shahrivar and the first
      // of Mehr; a Gregorian grouping would put both under one label.
      const months = async (): Promise<Record<string, number>> => {
        const body = (
          await asAdmin(http().get('/api/stats/dashboard')).expect(200)
        ).body as {
          newPatientsByMonth: Array<{ month: string; count: number }>;
        };
        return Object.fromEntries(
          body.newPatientsByMonth.map((m) => [m.month, m.count]),
        );
      };
      const before = await months();

      for (const firstVisitAt of ['1404/06/31', '1404/07/01']) {
        const created = await asAdmin(http().post('/api/patients'))
          .send({
            fileNo: nextNumber(),
            firstName: 'نرگس',
            lastName: 'یوسفی',
            firstVisitAt,
          })
          .expect(201);
        patientIds.push((created.body as { id: string }).id);
      }

      const after = await months();
      expect(after['1404/06']).toBe((before['1404/06'] ?? 0) + 1);
      expect(after['1404/07']).toBe((before['1404/07'] ?? 0) + 1);
    });
  });

  // ── Follow-ups ───────────────────────────────────────────────────

  describe('surgery follow-ups', () => {
    const today = formatJalali(new Date(), 'yyyy/MM/dd');
    const monthsAgo = (n: number): string =>
      formatJalali(addMonths(new Date(), -n), 'yyyy/MM/dd');

    it('falls due today three months after the surgery, and every window that holds today lists it', async () => {
      // Surgery three Jalali months ago at the default three months: the
      // follow-up is today. Today is in "this week", "this month" and
      // "pending"; it is not "overdue" and not "next month".
      const weekBefore = await followUpsThisWeek();
      const created = await asAdmin(http().post('/api/surgery-queue'))
        .send({
          recordedName: 'نرگس یوسفی',
          surgeryDate: monthsAgo(3),
          followUpMonths: 3,
        })
        .expect(201);
      const { id } = created.body as { id: string };
      surgeryIds.push(id);
      expect(created.body).toMatchObject({
        followUpMonths: 3,
        followUpState: 'due',
        followUpDate: { jalali: today },
      });

      for (const window of ['pending', 'week', 'thisMonth'] as const) {
        expect(await listFollowUps(window)).toContain(id);
      }
      for (const window of ['nextMonth', 'overdue'] as const) {
        expect(await listFollowUps(window)).not.toContain(id);
      }
      expect(await followUpsThisWeek()).toBe(weekBefore + 1);
    });

    it('leaves every window once the follow-up is marked done, and comes back when reopened', async () => {
      const created = await asAdmin(http().post('/api/surgery-queue'))
        .send({
          recordedName: 'نرگس یوسفی',
          surgeryDate: monthsAgo(3),
          followUpMonths: 3,
        })
        .expect(201);
      const { id } = created.body as { id: string };
      surgeryIds.push(id);

      const done = await asAdmin(http().patch(`/api/surgery-queue/${id}`))
        .send({ followUpDoneAt: today })
        .expect(200);
      expect(done.body).toMatchObject({
        followUpState: 'done',
        followUpDoneAt: today,
      });
      expect(await listFollowUps('pending')).not.toContain(id);
      expect(await listFollowUps('week')).not.toContain(id);

      // The switch went the wrong way: reopening puts it straight back.
      await asAdmin(http().patch(`/api/surgery-queue/${id}`))
        .send({ followUpDoneAt: null })
        .expect(200);
      expect(await listFollowUps('week')).toContain(id);
    });

    it('is overdue once its month has passed, and moves when the surgery date moves', async () => {
      const created = await asAdmin(http().post('/api/surgery-queue'))
        .send({
          recordedName: 'رضا احمدی',
          surgeryDate: monthsAgo(5),
          followUpMonths: 2,
        })
        .expect(201);
      const { id } = created.body as { id: string };
      surgeryIds.push(id);
      expect((created.body as { followUpState: string }).followUpState).toBe(
        'overdue',
      );
      expect(await listFollowUps('overdue')).toContain(id);
      expect(await listFollowUps('pending')).toContain(id);

      // The date is derived, so correcting the surgery date recomputes it —
      // two months from today lands in "next month" or later, not this month.
      const moved = await asAdmin(http().patch(`/api/surgery-queue/${id}`))
        .send({ surgeryDate: today })
        .expect(200);
      expect((moved.body as { followUpState: string }).followUpState).toBe(
        'pending',
      );
      expect(await listFollowUps('overdue')).not.toContain(id);
    });

    it('is an extraction or an implant, and an extraction carries no implant fields', async () => {
      const created = await asAdmin(http().post('/api/surgery-queue'))
        .send({
          kind: 'extraction',
          recordedName: 'لیلا حسینی',
          surgeryDate: today,
          followUpMonths: 2,
        })
        .expect(201);
      surgeryIds.push((created.body as { id: string }).id);
      expect(created.body).toMatchObject({
        kind: 'extraction',
        implantRegistryNo: null,
        implantCaseId: null,
        implantBrand: null,
      });
    });

    async function listFollowUps(followUp: string): Promise<string[]> {
      const res = await asAdmin(
        http().get('/api/surgery-queue').query({ followUp, limit: 100 }),
      ).expect(200);
      return (res.body as { items: Array<{ id: string }> }).items.map(
        (i) => i.id,
      );
    }

    async function followUpsThisWeek(): Promise<number> {
      const res = await asAdmin(http().get('/api/stats/dashboard')).expect(200);
      return (res.body as { totals: { followUpsThisWeek: number } }).totals
        .followUpsThisWeek;
    }
  });

  // ── Register numbers on the surgery list ─────────────────────────

  describe('surgery register numbers', () => {
    it("offers the implant book's next number, and opens the book entry when it is used", async () => {
      // The next number is one past the book's highest, never a patient's
      // file number. Saving a row with it registers the case, so the book
      // and the list cannot drift apart.
      const highest = nextNumber();
      const seed = await asAdmin(http().post('/api/implant-cases'))
        .send({ registryNo: highest, recordedName: 'کاظم نوری' })
        .expect(201);
      implantCaseIds.push((seed.body as { id: string }).id);

      const next = await asAdmin(
        http().get('/api/surgery-queue/next-registry-no'),
      ).expect(200);
      const { registryNo } = next.body as { registryNo: string };
      expect(Number(registryNo)).toBe(Number(highest) + 1);

      const surgery = await asAdmin(http().post('/api/surgery-queue'))
        .send({ recordedName: 'کاظم نوری', implantRegistryNo: registryNo })
        .expect(201);
      const body = surgery.body as {
        id: string;
        implantCaseId: string | null;
        hasNameMismatch: boolean;
      };
      surgeryIds.push(body.id);
      expect(body.implantCaseId).not.toBeNull();
      expect(body.hasNameMismatch).toBe(false);
      implantCaseIds.push(body.implantCaseId!);

      const registered = await asAdmin(
        http().get(`/api/implant-cases/${body.implantCaseId}`),
      ).expect(200);
      expect(registered.body).toMatchObject({
        registryNo,
        recordedName: 'کاظم نوری',
      });

      // The book moved on: the next offer is one further along.
      const after = await asAdmin(
        http().get('/api/surgery-queue/next-registry-no'),
      ).expect(200);
      expect(Number((after.body as { registryNo: string }).registryNo)).toBe(
        Number(registryNo) + 1,
      );
    });

    it('is written as done, not scheduled: the list records surgeries that happened', async () => {
      const surgery = await asAdmin(http().post('/api/surgery-queue'))
        .send({ recordedName: 'کاظم نوری' })
        .expect(201);
      surgeryIds.push((surgery.body as { id: string }).id);
      expect((surgery.body as { status: string }).status).toBe('completed');
    });
  });

  // ── Surgery list identity check ──────────────────────────────────

  describe('surgery queue', () => {
    it('clears a date only when told to, and leaves it alone when the field is omitted', async () => {
      const created = await asAdmin(http().post('/api/surgery-queue'))
        .send({ recordedName: 'مریم کریمی', surgeryDate: '1404/06/11' })
        .expect(201);
      const { id } = created.body as { id: string };
      surgeryIds.push(id);
      expect(created.body).toMatchObject({
        surgeryDate: { jalali: '1404/06/11' },
      });

      // A PATCH without the field is "don't touch the date".
      const untouched = await asAdmin(http().patch(`/api/surgery-queue/${id}`))
        .send({ notes: 'یادداشت' })
        .expect(200);
      expect(untouched.body).toMatchObject({
        surgeryDate: { jalali: '1404/06/11' },
      });

      // An explicit null is "clear it" — what the form sends when the picker
      // was emptied on purpose.
      const cleared = await asAdmin(http().patch(`/api/surgery-queue/${id}`))
        .send({ surgeryDate: null })
        .expect(200);
      expect((cleared.body as { surgeryDate: unknown }).surgeryDate).toBeNull();
    });

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
