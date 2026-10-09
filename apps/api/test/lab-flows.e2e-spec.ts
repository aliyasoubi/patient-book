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
  teethFdi: number[];
  toothCount: number | null;
  teeth: string;
  timeliness: 'on_time' | 'due_today' | 'overdue' | null;
  daysLate: number;
  appointmentAt: string | null;
  appointmentTimeliness: 'on_time' | 'due_today' | 'overdue' | null;
  appointmentDays: number | null;
  partsOutstanding: boolean;
  partsDueAt: string | null;
  partsTimeliness: 'on_time' | 'due_today' | 'overdue' | null;
  partsDaysLate: number;
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
  booked: LabCaseBody[];
  delivered: LabCaseBody[];
  partsChase: LabCaseBody[];
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
      const overdueBefore = (before.body as { labsOverdue: number })
        .labsOverdue;

      const late = await openCase(`آزمون دیرکرد ${runId}`, 10, 7);
      expect(late).toMatchObject({ timeliness: 'overdue', daysLate: 3 });
      const due = await openCase(`آزمون موعد ${runId}`, 7, 7);
      expect(due).toMatchObject({ timeliness: 'due_today', daysLate: 0 });

      const after = await asStaff(http().get('/api/stats/dashboard')).expect(
        200,
      );
      expect((after.body as { labsOverdue: number }).labsOverdue).toBe(
        overdueBefore + 1,
      );

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

  describe('booking the patient', () => {
    const received = async (name: string): Promise<LabCaseBody> => {
      const opened = await openCase(name);
      return (
        await asStaff(http().post(`/api/lab-cases/${opened.id}/receive`))
          .send({})
          .expect(200)
      ).body as LabCaseBody;
    };
    const book = (id: string, date: string) =>
      asStaff(http().post(`/api/lab-cases/${id}/book`)).send({ date });
    const toBook = async () =>
      (
        (await asStaff(http().get('/api/stats/dashboard')).expect(200))
          .body as { labsToBook: number }
      ).labsToBook;

    it('keeps «needs a booking» to exactly the work with none, and counts it for the front desk', async () => {
      const before = await toBook();
      const back = await received(`آزمون نوبت ${runId}`);
      expect(back).toMatchObject({ stage: 'at_clinic', appointmentAt: null });
      expect(await toBook()).toBe(before + 1);

      const booked = (await book(back.id, daysAgo(-3)).expect(200))
        .body as LabCaseBody;
      expect(booked).toMatchObject({
        stage: 'booked',
        appointmentAt: daysAgo(-3),
        appointmentTimeliness: 'on_time',
        appointmentDays: 3,
      });
      // Off the front desk's list, into the booked column.
      expect(await toBook()).toBe(before);
      const columns = await board(`آزمون نوبت ${runId}`);
      expect(columns.atClinic).toHaveLength(0);
      expect(columns.booked.map((c) => c.id)).toEqual([back.id]);
    });

    it('lets the day be changed, and flags a booking whose day has passed', async () => {
      const back = await received(`آزمون تغییر نوبت ${runId}`);
      await book(back.id, daysAgo(-5)).expect(200);

      const changed = (await book(back.id, daysAgo(2)).expect(200))
        .body as LabCaseBody;
      expect(changed).toMatchObject({
        stage: 'booked',
        appointmentTimeliness: 'overdue',
        appointmentDays: -2,
      });
      const today = (await book(back.id, daysAgo(0)).expect(200))
        .body as LabCaseBody;
      expect(today.appointmentTimeliness).toBe('due_today');
    });

    it('takes the booking back with an undo, and drops it when sent back to the lab', async () => {
      const back = await received(`آزمون لغو نوبت ${runId}`);
      const booked = (await book(back.id, daysAgo(-2)).expect(200))
        .body as LabCaseBody;

      const undone = (
        await asStaff(http().post(`/api/lab-cases/${back.id}/undo`))
          .send({ expectedVersion: booked.version })
          .expect(200)
      ).body as LabCaseBody;
      expect(undone).toMatchObject({ stage: 'at_clinic', appointmentAt: null });

      await book(back.id, daysAgo(-2)).expect(200);
      const sent = (
        await asStaff(http().post(`/api/lab-cases/${back.id}/send`))
          .send({ kind: 'correction', waitDays: 3 })
          .expect(200)
      ).body as LabCaseBody;
      expect(sent).toMatchObject({ stage: 'at_lab', appointmentAt: null });
    });

    it('delivers straight from a booking, and an undone delivery returns to it', async () => {
      const back = await received(`آزمون تحویل نوبت ${runId}`);
      await book(back.id, daysAgo(-1)).expect(200);
      const delivered = (
        await asStaff(http().post(`/api/lab-cases/${back.id}/deliver`))
          .send({})
          .expect(200)
      ).body as LabCaseBody;
      expect(delivered).toMatchObject({
        stage: 'delivered',
        appointmentTimeliness: null,
      });

      const undone = (
        await asStaff(http().post(`/api/lab-cases/${back.id}/undo`))
          .send({ expectedVersion: delivered.version })
          .expect(200)
      ).body as LabCaseBody;
      expect(undone.stage).toBe('booked');
    });

    it('refuses a booking for work still at the lab, and a bad date', async () => {
      const atLab = await openCase(`آزمون نوبت در لابراتوار ${runId}`);
      await book(atLab.id, daysAgo(-1)).expect(409);
      const back = await received(`آزمون تاریخ بد ${runId}`);
      await book(back.id, 'فردا').expect(400);
    });
  });

  describe('implant parts at the receipt', () => {
    const implantCase = (name: string) =>
      openCase(name, 0, 7, {
        workTypes: ['implant_crown'],
        implantBrand: 'دنتیوم',
        impressionCount: 2,
        analogCount: 2,
      });
    const receive = async (id: string, body: object) =>
      (
        await asStaff(http().post(`/api/lab-cases/${id}/receive`))
          .send(body)
          .expect(200)
      ).body as LabCaseBody;

    it('counts the parts back when they came with the work, and takes them back with an undo', async () => {
      const opened = await implantCase(`آزمون قطعات همراه ${runId}`);
      const received = await receive(opened.id, { partsReturned: true });
      expect(received).toMatchObject({
        stage: 'at_clinic',
        partsOutstanding: false,
      });

      const undone = (
        await asStaff(http().post(`/api/lab-cases/${opened.id}/undo`))
          .send({ expectedVersion: received.version })
          .expect(200)
      ).body as LabCaseBody;
      expect(undone).toMatchObject({
        stage: 'at_lab',
        partsOutstanding: true,
      });
    });

    it('keeps the parts owed when only the work came, until they are marked', async () => {
      const opened = await implantCase(`آزمون فقط کار ${runId}`);
      const received = await receive(opened.id, { partsReturned: false });
      expect(received).toMatchObject({
        stage: 'at_clinic',
        partsOutstanding: true,
      });

      // Marked from the clinic column, without waiting for the delivery.
      const returned = await asStaff(
        http().post(`/api/lab-cases/${opened.id}/parts-returned`),
      )
        .send({ returned: true })
        .expect(200);
      expect(returned.body as LabCaseBody).toMatchObject({
        stage: 'at_clinic',
        partsOutstanding: false,
      });
    });

    it('chases parts that did not come on their own clock, apart from the work', async () => {
      const opened = await implantCase(`آزمون پیگیری قطعات ${runId}`);
      const received = await receive(opened.id, {
        partsReturned: false,
        partsWaitDays: 3,
      });
      // The work is at the clinic and can be fitted; the parts are due in three days.
      expect(received).toMatchObject({
        stage: 'at_clinic',
        partsOutstanding: true,
        partsDueAt: jalali(addDays(new Date(), 3)),
        partsTimeliness: 'on_time',
        partsDaysLate: 0,
      });
      let columns = await board('');
      expect(columns.partsChase.map((c) => c.id)).toContain(opened.id);

      // Marked back: off the chase list.
      await asStaff(http().post(`/api/lab-cases/${opened.id}/parts-returned`))
        .send({ returned: true })
        .expect(200);
      columns = await board('');
      expect(columns.partsChase.map((c) => c.id)).not.toContain(opened.id);
    });

    it('drops the chase when the receipt is undone', async () => {
      const opened = await implantCase(`آزمون برگشت پیگیری ${runId}`);
      const received = await receive(opened.id, { partsReturned: false });
      // Seven days unless told otherwise.
      expect(received.partsDueAt).toBe(jalali(addDays(new Date(), 7)));

      const undone = (
        await asStaff(http().post(`/api/lab-cases/${opened.id}/undo`))
          .send({ expectedVersion: received.version })
          .expect(200)
      ).body as LabCaseBody;
      expect(undone).toMatchObject({ stage: 'at_lab', partsDueAt: null });
      expect((await board('')).partsChase.map((c) => c.id)).not.toContain(
        opened.id,
      );
    });

    it('ignores the flag on work that sent no parts', async () => {
      const opened = await openCase(`آزمون بدون قطعات ${runId}`);
      const received = await receive(opened.id, { partsReturned: true });
      expect(received.partsOutstanding).toBe(false);
      expect(received).toMatchObject({ stage: 'at_clinic' });
    });
  });

  describe('editing a case', () => {
    it('takes one kind of work per case', async () => {
      const body = {
        recordedName: `آزمون یک نوع کار ${runId}`,
        labId,
        tripKind: 'impression',
        sentAt: daysAgo(0),
        waitDays: 7,
      };
      for (const workTypes of [[], ['crown', 'laminate']]) {
        await asStaff(http().post('/api/lab-cases'))
          .send({ ...body, workTypes })
          .expect(400);
      }
    });

    it('records per-jaw work by jaw, and per-tooth work by teeth', async () => {
      for (const workType of ['night_guard', 'sx']) {
        const opened = await openCase(`آزمون فک ${workType} ${runId}`, 0, 7, {
          workTypes: [workType],
          jaw: 'upper',
          // Teeth make no sense on per-jaw work: dropped, not stored.
          teethFdi: [16],
        });
        expect(opened).toMatchObject({
          jaw: 'upper',
          teethFdi: [],
          toothCount: null,
          teeth: '',
        });
      }

      const opened = await openCase(`آزمون دندان ${runId}`, 0, 7, {
        workTypes: ['night_guard'],
        jaw: 'upper',
      });
      const edited = (
        await asStaff(http().patch(`/api/lab-cases/${opened.id}`))
          .send({
            workTypes: ['crown'],
            teethFdi: [17, 16, 21],
            expectedVersion: opened.version,
          })
          .expect(200)
      ).body as LabCaseBody;
      // Sorted, counted from the chart, and the jaw is gone.
      expect(edited).toMatchObject({
        jaw: null,
        teethFdi: [16, 17, 21],
        toothCount: 3,
        teeth: '',
      });

      // Not teeth the chart offers: a wisdom tooth, a primary tooth, a repeat.
      for (const teethFdi of [[18], [51], [0], [16, 16]]) {
        await asStaff(http().patch(`/api/lab-cases/${opened.id}`))
          .send({ teethFdi, expectedVersion: edited.version })
          .expect(400);
      }
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
            teethFdi: [16],
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
        .send({ teethFdi: [17], expectedVersion: edited.version })
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
