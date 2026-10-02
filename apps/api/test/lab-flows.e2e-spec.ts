import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { addDays, format as formatJalali } from 'date-fns-jalali';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BCRYPT_COST, User } from '../src/modules/users/user.entity';
import { ErrorCode, UserRole } from '../src/domain';

/**
 * The lab board over HTTP against a real database: a case opened with its
 * first trip, moved between the three columns, undone, and refused when two
 * people move it at once. Same guard as clinic-flows: only a throwaway
 * database (`*_e2e`, `*_test`, or CI) is ever written to.
 */
const dbName = process.env.DB_NAME ?? '';
const writable = process.env.CI === 'true' || /(_e2e|_test)$/.test(dbName);
const describeIfWritable = writable ? describe : describe.skip;
if (!writable) {
  console.warn(
    `lab-flows.e2e-spec: skipped — DB_NAME="${dbName}" is not a throwaway database.`,
  );
}

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const jalali = (date: Date): string => formatJalali(date, 'yyyy/MM/dd');
const daysAgo = (n: number): string => jalali(addDays(new Date(), -n));

interface LabCaseBody {
  id: string;
  version: number;
  stage: 'at_lab' | 'at_clinic' | 'delivered';
  jaw: 'upper' | 'lower' | 'both' | null;
  toothCount: number | null;
  teeth: string;
  timeliness: 'on_time' | 'due_today' | 'overdue' | null;
  daysLate: number;
  partsOutstanding: boolean;
  deliveredAt: string | null;
  lab: { id: string; name: string };
  trips: Array<{
    sequence: number;
    kind: string;
    sentAt: string;
    expectedAt: string;
    receivedAt: string | null;
  }>;
}
interface BoardBody {
  atLab: LabCaseBody[];
  atClinic: LabCaseBody[];
  delivered: LabCaseBody[];
}

describeIfWritable('lab flows (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let staffToken: string;
  let viewerToken: string;
  let labId: string;

  const staffUsername = `e2e-lab-reception-${runId}`;
  const viewerUsername = `e2e-lab-viewer-${runId}`;
  // Fixture credentials for this run only; never a real account's.
  const password = `E2e!${runId}Pass`;
  const userIds: string[] = [];
  const caseIds: string[] = [];
  const labIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const asStaff = (req: request.Test) =>
    req.set('Authorization', `Bearer ${staffToken}`);
  const asViewer = (req: request.Test) =>
    req.set('Authorization', `Bearer ${viewerToken}`);

  async function login(username: string): Promise<string> {
    const res = await http()
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  /** A case at the lab: an impression sent `sentDaysAgo` days ago with a `waitDays` turnaround. */
  async function openCase(
    name: string,
    sentDaysAgo = 0,
    waitDays = 7,
    extra: Record<string, unknown> = {},
  ): Promise<LabCaseBody> {
    const res = await asStaff(http().post('/api/lab-cases'))
      .send({
        recordedName: name,
        labId,
        workTypes: ['crown'],
        tripKind: 'impression',
        sentAt: daysAgo(sentDaysAgo),
        waitDays,
        ...extra,
      })
      .expect(201);
    const body = res.body as LabCaseBody;
    caseIds.push(body.id);
    return body;
  }

  const board = async (q: string): Promise<BoardBody> =>
    (await asStaff(http().get('/api/lab-cases/board')).query({ q }).expect(200))
      .body as BoardBody;

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
      [staffUsername, UserRole.Receptionist],
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
    staffToken = await login(staffUsername);
    viewerToken = await login(viewerUsername);

    // A lab of this run's own, so its cases never mix with anything else.
    const lab = await asStaff(http().post('/api/labs'))
      .send({ name: `لابراتوار آزمون ${runId}` })
      .expect(201);
    labId = (lab.body as { id: string }).id;
    labIds.push(labId);
  });

  afterAll(async () => {
    if (caseIds.length) {
      await db.query(`DELETE FROM lab_cases WHERE id = ANY($1)`, [caseIds]);
    }
    if (labIds.length) {
      await db.query(`DELETE FROM labs WHERE id = ANY($1)`, [labIds]);
    }
    if (userIds.length) {
      await db.query(`DELETE FROM audit_logs WHERE "userId" = ANY($1)`, [
        userIds,
      ]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
    await app.close();
  });

  describe('labs', () => {
    it('seeds the practice’s six labs, and refuses a second lab by the same name', async () => {
      const res = await asStaff(http().get('/api/labs')).expect(200);
      const names = (res.body as Array<{ name: string }>).map((l) => l.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'فرهنگ',
          'سزاوار',
          'آگر',
          'زنیت',
          'سعید',
          'راه پیما',
        ]),
      );

      // آگر and اگر fold to one name.
      const clash = await asStaff(http().post('/api/labs'))
        .send({ name: 'اگر' })
        .expect(409);
      expect((clash.body as { code: string }).code).toBe(
        ErrorCode.LabNameTaken,
      );
    });

    it('keeps a viewer out of the catalogue and the board’s writes', async () => {
      await asViewer(http().post('/api/labs'))
        .send({ name: 'تازه' })
        .expect(403);
      await asViewer(http().post('/api/lab-cases'))
        .send({
          recordedName: 'بیننده',
          labId,
          workTypes: ['crown'],
          tripKind: 'impression',
          sentAt: daysAgo(0),
          waitDays: 7,
        })
        .expect(403);
      await asViewer(http().get('/api/lab-cases/board')).expect(200);
    });
  });

  describe('a case through the board', () => {
    it('goes to the lab, comes back, goes again for a try-in, and is delivered', async () => {
      const name = `آزمون رفت‌وبرگشت ${runId}`;
      const opened = await openCase(name, 2, 7);
      expect(opened).toMatchObject({ stage: 'at_lab', timeliness: 'on_time' });
      expect(opened.trips).toHaveLength(1);

      const received = await asStaff(
        http().post(`/api/lab-cases/${opened.id}/receive`),
      )
        .send({})
        .expect(200);
      expect(received.body).toMatchObject({ stage: 'at_clinic' });
      expect((received.body as LabCaseBody).trips[0].receivedAt).toBe(
        daysAgo(0),
      );

      const sent = await asStaff(
        http().post(`/api/lab-cases/${opened.id}/send`),
      )
        .send({ kind: 'frame', waitDays: 14, note: 'رنگ A2' })
        .expect(200);
      const second = (sent.body as LabCaseBody).trips[1];
      expect(sent.body).toMatchObject({ stage: 'at_lab' });
      expect(second).toMatchObject({
        sequence: 2,
        kind: 'frame',
        sentAt: daysAgo(0),
        expectedAt: jalali(addDays(new Date(), 14)),
        receivedAt: null,
      });

      await asStaff(http().post(`/api/lab-cases/${opened.id}/receive`))
        .send({})
        .expect(200);
      const delivered = await asStaff(
        http().post(`/api/lab-cases/${opened.id}/deliver`),
      )
        .send({})
        .expect(200);
      expect(delivered.body).toMatchObject({
        stage: 'delivered',
        deliveredAt: daysAgo(0),
      });

      const columns = await board(name);
      expect(columns.atLab).toHaveLength(0);
      expect(columns.atClinic).toHaveLength(0);
      expect(columns.delivered.map((c) => c.id)).toEqual([opened.id]);
    });

    it('is overdue the day after it was due, and the dashboard counts it', async () => {
      const before = await asStaff(http().get('/api/stats/dashboard')).expect(
        200,
      );
      const overdueBefore = (before.body as { totals: { labsOverdue: number } })
        .totals.labsOverdue;

      const late = await openCase(`آزمون دیرکرد ${runId}`, 10, 7);
      expect(late).toMatchObject({ timeliness: 'overdue', daysLate: 3 });
      const due = await openCase(`آزمون موعد ${runId}`, 7, 7);
      expect(due).toMatchObject({ timeliness: 'due_today', daysLate: 0 });

      const after = await asStaff(http().get('/api/stats/dashboard')).expect(
        200,
      );
      expect(
        (after.body as { totals: { labsOverdue: number } }).totals.labsOverdue,
      ).toBe(overdueBefore + 1);

      // Most overdue first in the column.
      const columns = await board(`آزمون ${runId}`);
      const atLab = columns.atLab.map((c) => c.id);
      expect(atLab.indexOf(late.id)).toBeLessThan(atLab.indexOf(due.id));
    });

    it('refuses a move from where the case no longer is, naming where it is', async () => {
      const opened = await openCase(`آزمون همزمان ${runId}`);

      // Two people press «دریافت شد» on the same card at once.
      const results = await Promise.all(
        [0, 1].map(() =>
          asStaff(http().post(`/api/lab-cases/${opened.id}/receive`)).send({}),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const refused = results.find((r) => r.status === 409)!;
      expect(refused.body).toMatchObject({
        code: ErrorCode.LabCaseMoved,
        params: { stage: 'at_clinic' },
      });

      // Delivered only from the clinic — what is at the lab is received first.
      await asStaff(http().post(`/api/lab-cases/${opened.id}/send`))
        .send({ kind: 'correction', waitDays: 3 })
        .expect(200);
      const early = await asStaff(
        http().post(`/api/lab-cases/${opened.id}/deliver`),
      )
        .send({})
        .expect(409);
      expect((early.body as { code: string }).code).toBe(
        ErrorCode.LabCaseMoved,
      );
    });

    it('undoes one move at a time, and only from the version it was offered on', async () => {
      const opened = await openCase(`آزمون برگرداندن ${runId}`);
      const receive = async (): Promise<LabCaseBody> =>
        (
          await asStaff(http().post(`/api/lab-cases/${opened.id}/receive`))
            .send({})
            .expect(200)
        ).body as LabCaseBody;
      const undo = (version: number) =>
        asStaff(http().post(`/api/lab-cases/${opened.id}/undo`)).send({
          expectedVersion: version,
        });

      // The first trip opened the case: there is nothing before it.
      const nothing = await undo(opened.version).expect(409);
      expect((nothing.body as { code: string }).code).toBe(
        ErrorCode.LabCaseNothingToUndo,
      );

      const back = await receive();
      const sent = (
        await asStaff(http().post(`/api/lab-cases/${opened.id}/send`))
          .send({ kind: 'resin', waitDays: 7 })
          .expect(200)
      ).body as LabCaseBody;

      // A card drawn before the send is stale; its undo is refused.
      const stale = await undo(back.version).expect(409);
      expect((stale.body as { code: string }).code).toBe(
        ErrorCode.LabCaseModified,
      );

      // Undoing the send removes that trip; undoing again reopens the first.
      const unsent = (await undo(sent.version).expect(200)).body as LabCaseBody;
      expect(unsent).toMatchObject({ stage: 'at_clinic' });
      expect(unsent.trips).toHaveLength(1);
      const unreceived = (await undo(unsent.version).expect(200))
        .body as LabCaseBody;
      expect(unreceived).toMatchObject({ stage: 'at_lab' });
      expect(unreceived.trips[0].receivedAt).toBeNull();
    });

    it('owes the implant parts until they are marked returned, even once delivered', async () => {
      const opened = await openCase(`آزمون قطعات ${runId}`, 0, 7, {
        workTypes: ['implant_crown'],
        implantBrand: 'دنتیوم',
        impressionCount: 2,
        analogCount: 2,
      });
      expect(opened.partsOutstanding).toBe(true);

      await asStaff(http().post(`/api/lab-cases/${opened.id}/receive`))
        .send({})
        .expect(200);
      await asStaff(http().post(`/api/lab-cases/${opened.id}/deliver`))
        .send({ date: daysAgo(40) })
        .expect(200);

      // Delivered well over a month ago, but still on the board: parts owed.
      let columns = await board('');
      expect(columns.delivered.map((c) => c.id)).toContain(opened.id);

      const returned = await asStaff(
        http().post(`/api/lab-cases/${opened.id}/parts-returned`),
      )
        .send({ returned: true })
        .expect(200);
      expect((returned.body as LabCaseBody).partsOutstanding).toBe(false);
      columns = await board('');
      expect(columns.delivered.map((c) => c.id)).not.toContain(opened.id);
    });
  });

  describe('editing a case', () => {
    it('records a night guard by jaw, and moves it to teeth when it becomes other work', async () => {
      const opened = await openCase(`آزمون نایت گارد ${runId}`, 0, 7, {
        workTypes: ['night_guard'],
        jaw: 'upper',
      });
      expect(opened).toMatchObject({
        jaw: 'upper',
        toothCount: null,
        teeth: '',
      });

      const edited = (
        await asStaff(http().patch(`/api/lab-cases/${opened.id}`))
          .send({
            workTypes: ['crown'],
            jaw: null,
            toothCount: 1,
            teeth: '۶ بالا راست',
            expectedVersion: opened.version,
          })
          .expect(200)
      ).body as LabCaseBody;
      expect(edited).toMatchObject({
        jaw: null,
        toothCount: 1,
        teeth: '۶ بالا راست',
      });

      // Not a jaw the form offers.
      await asStaff(http().patch(`/api/lab-cases/${opened.id}`))
        .send({ jaw: 'left', expectedVersion: edited.version })
        .expect(400);
    });

    it('corrects the latest trip, and is refused once the case has moved', async () => {
      const opened = await openCase(`آزمون ویرایش ${runId}`, 0, 7);

      const edited = (
        await asStaff(http().patch(`/api/lab-cases/${opened.id}`))
          .send({
            teeth: '۶ بالا راست',
            sentAt: daysAgo(3),
            waitDays: 21,
            expectedVersion: opened.version,
          })
          .expect(200)
      ).body as LabCaseBody;
      expect(edited.trips[0]).toMatchObject({
        sentAt: daysAgo(3),
        expectedAt: jalali(addDays(new Date(), 18)),
      });

      // Someone receives it while the form is still open on the old copy.
      await asStaff(http().post(`/api/lab-cases/${opened.id}/receive`))
        .send({})
        .expect(200);
      const stale = await asStaff(http().patch(`/api/lab-cases/${opened.id}`))
        .send({ teeth: '۷', expectedVersion: edited.version })
        .expect(409);
      expect((stale.body as { code: string }).code).toBe(
        ErrorCode.LabCaseModified,
      );
    });

    it('archives a case off the board and restores it', async () => {
      const name = `آزمون بایگانی ${runId}`;
      const opened = await openCase(name);
      await asStaff(http().delete(`/api/lab-cases/${opened.id}`)).expect(204);
      expect((await board(name)).atLab).toHaveLength(0);

      const archived = await asStaff(http().get('/api/lab-cases'))
        .query({ archivedOnly: true, q: name })
        .expect(200);
      expect(
        (archived.body as { items: LabCaseBody[] }).items.map((c) => c.id),
      ).toEqual([opened.id]);

      await asStaff(http().post(`/api/lab-cases/${opened.id}/restore`)).expect(
        201,
      );
      expect((await board(name)).atLab.map((c) => c.id)).toEqual([opened.id]);
    });
  });
});
