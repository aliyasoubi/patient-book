import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { addMonths, format } from 'date-fns';
import {
  addMonths as addJalaliMonths,
  format as formatJalali,
  setDate as setJalaliDate,
} from 'date-fns-jalali';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BCRYPT_COST, User } from '../src/modules/users/user.entity';
import { ErrorCode, UserRole } from '../src/domain';

/**
 * The stock over HTTP against a real database: an item opened with what is on
 * the shelf, delivered, used, counted, filtered, archived — and refused when
 * more is taken than is there, when it would duplicate another item, or when
 * an edit was loaded before a movement. Same guard as clinic-flows: only a
 * throwaway database (`*_e2e`, `*_test`, or CI) is ever written to.
 */
const dbName = process.env.DB_NAME ?? '';
const writable = process.env.CI === 'true' || /(_e2e|_test)$/.test(dbName);
const describeIfWritable = writable ? describe : describe.skip;
if (!writable) {
  console.warn(
    `inventory-flows.e2e-spec: skipped — DB_NAME="${dbName}" is not a throwaway database.`,
  );
}

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
/** A Gregorian month as printed on a pack, `months` from now. */
const printed = (months: number): string =>
  format(addMonths(new Date(), months), 'yyyy/MM');

interface ItemBody {
  id: string;
  name: string;
  quantity: number;
  minQuantity: number | null;
  stockState: 'ok' | 'low' | 'out';
  expiry: string | null;
  expiryState: 'ok' | 'expiring' | 'expired' | null;
  version: number;
  isArchived: boolean;
  soldToPatients: boolean;
  lots: Array<{
    id: string;
    lotNumber: string | null;
    expiry: string | null;
    quantity: number;
  }>;
  movements: Array<{
    id: string;
    kind: string;
    change: number;
    quantityAfter: number;
    lotNumber: string | null;
    patient: { id: string; fileNo: string; fullName: string } | null;
    note: string | null;
    by: string | null;
  }>;
}

describeIfWritable('inventory flows (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let staffToken: string;
  let viewerToken: string;

  const staffUsername = `e2e-stock-staff-${runId}`;
  const viewerUsername = `e2e-stock-viewer-${runId}`;
  // Fixture credentials for this run only; never a real account's.
  const password = `E2e!${runId}Pass`;
  const userIds: string[] = [];
  const itemIds: string[] = [];
  const patientIds: string[] = [];
  /** Patients whose implant file a test had the stock open. */
  const implantCasePatients: string[] = [];

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

  /**
   * An item of this run's own line, so its rows never mix with anything
   * else: a prosthetic part by default — measured like an implant, but not
   * traced by lot — and an implant where the test is about tracing.
   */
  async function addItem(
    body: Record<string, unknown> = {},
  ): Promise<ItemBody> {
    const res = await asStaff(http().post('/api/inventory/items'))
      .send({
        category: 'prosthetic',
        name: `line-${runId}`,
        brand: 'Dentium',
        spec: '4x10',
        ...body,
      })
      .expect(201);
    const item = res.body as ItemBody;
    itemIds.push(item.id);
    return item;
  }

  /** Out of the list, so the list's own test sees only its items. */
  const archive = (id: string) =>
    asStaff(http().delete(`/api/inventory/items/${id}`)).expect(204);

  const move = (id: string, body: Record<string, unknown>) =>
    asStaff(http().post(`/api/inventory/items/${id}/movements`)).send(body);

  const list = async (query: Record<string, string>): Promise<ItemBody[]> =>
    (
      await asStaff(http().get('/api/inventory/items'))
        .query({ q: `line-${runId}`, ...query })
        .expect(200)
    ).body as ItemBody[];

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
  });

  afterAll(async () => {
    if (itemIds.length) {
      await db.query(`DELETE FROM inventory_items WHERE id = ANY($1)`, [
        itemIds,
      ]);
    }
    if (implantCasePatients.length) {
      await db.query(
        `DELETE FROM surgery_queue WHERE "implantCaseId" IN
           (SELECT id FROM implant_cases WHERE "patientId" = ANY($1))`,
        [implantCasePatients],
      );
      await db.query(`DELETE FROM implant_cases WHERE "patientId" = ANY($1)`, [
        implantCasePatients,
      ]);
    }
    if (patientIds.length) {
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

  it('opens an item with its shelf count as the first line of its card', async () => {
    const item = await addItem({ quantity: 6, expiry: printed(24) });
    expect(item).toMatchObject({
      quantity: 6,
      stockState: 'ok',
      expiry: printed(24),
      expiryState: 'ok',
    });
    expect(item.movements).toEqual([
      expect.objectContaining({ kind: 'count', change: 6, quantityAfter: 6 }),
    ]);
  });

  it('refuses a second item for the same product, however it is spelled', async () => {
    const res = await asStaff(http().post('/api/inventory/items'))
      .send({
        category: 'prosthetic',
        name: `LINE-${runId}`,
        brand: 'dentium',
        spec: '4 x 10',
      })
      .expect(409);
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.InventoryItemExists,
    );
  });

  it('receives, uses and counts batch by batch, first-expiring first', async () => {
    const item = await addItem({
      spec: '4.5x8',
      quantity: 2,
      expiry: printed(12),
    });

    const received = (
      await move(item.id, {
        kind: 'receive',
        quantity: 10,
        lotNumber: 'L-36',
        expiry: printed(36),
        note: 'فاکتور ۱۲',
      }).expect(200)
    ).body as ItemBody;
    // The two already there go first, so their date is the one that matters.
    expect(received).toMatchObject({ quantity: 12, expiry: printed(12) });

    const tooMany = await move(item.id, { kind: 'use', quantity: 13 }).expect(
      409,
    );
    expect(tooMany.body).toMatchObject({
      code: ErrorCode.InventoryInsufficientStock,
      params: { available: 12 },
    });

    const used = (await move(item.id, { kind: 'use', quantity: 3 }).expect(200))
      .body as ItemBody;
    expect(used.quantity).toBe(9);

    const counted = (
      await move(item.id, { kind: 'count', quantity: 8 }).expect(200)
    ).body as ItemBody;
    expect(counted.quantity).toBe(8);
    // The two that expire first went first, then one of the delivery; the
    // count's missing one comes out of what is left.
    expect(
      counted.movements.map((m) => [m.kind, m.change, m.quantityAfter]),
    ).toEqual([
      ['count', -1, 8],
      ['use', -1, 9],
      ['use', -2, 10],
      ['receive', 10, 12],
      ['count', 2, 2],
    ]);
    expect(counted.movements[3]).toMatchObject({
      note: 'فاکتور ۱۲',
      by: 'e2e receptionist',
    });
    expect(counted.lots).toEqual([
      expect.objectContaining({ expiry: printed(36), quantity: 8 }),
    ]);
    expect(counted.expiry).toBe(printed(36));

    // Something has to move; only a count may find the shelf empty.
    await move(item.id, { kind: 'receive', quantity: 0 }).expect(400);
  });

  it('traces a batch of implants to the patient it went into', async () => {
    const fileNo = `9${Date.now()}`;
    const patient = await asStaff(http().post('/api/patients'))
      .send({ fileNo, firstName: 'آزمون', lastName: 'انبار' })
      .expect(201);
    patientIds.push((patient.body as { id: string }).id);
    implantCasePatients.push((patient.body as { id: string }).id);

    const item = await addItem({
      name: `traced-${runId}`,
      category: 'implant',
      quantity: 2,
      lotNumber: 'a-100',
      expiry: printed(30),
    });
    // The same lot and expiry delivered again is the same batch.
    let body = (
      await move(item.id, {
        kind: 'receive',
        quantity: 3,
        lotNumber: ' A-100 ',
        expiry: printed(30),
      }).expect(200)
    ).body as ItemBody;
    body = (
      await move(item.id, {
        kind: 'receive',
        quantity: 4,
        lotNumber: 'B-200',
        expiry: printed(40),
      }).expect(200)
    ).body as ItemBody;
    expect(body.lots.map((l) => [l.lotNumber, l.quantity])).toEqual([
      ['A-100', 5],
      ['B-200', 4],
    ]);

    // From the batch named, not the first-expiring one, and into a patient.
    const later = body.lots[1];
    body = (
      await move(item.id, {
        kind: 'use',
        quantity: 1,
        lotId: later.id,
        patientFileNo: fileNo.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]),
        tooth: '۳۶',
      }).expect(200)
    ).body as ItemBody;
    expect(body.movements[0]).toMatchObject({
      kind: 'use',
      change: -1,
      lotNumber: 'B-200',
      patient: { fileNo },
    });

    // An implant goes in one at a time, so a use asking for four is refused
    // before the shelf is looked at.
    const tooMany = await move(item.id, {
      kind: 'use',
      quantity: 4,
      lotId: later.id,
      patientFileNo: fileNo,
      tooth: '36',
    }).expect(400);
    expect(tooMany.body).toMatchObject({
      code: ErrorCode.InventoryImplantOneTooth,
    });

    const unknown = await move(item.id, {
      kind: 'use',
      quantity: 1,
      patientFileNo: '1',
      tooth: '36',
    }).expect(404);
    expect(unknown.body).toMatchObject({
      code: ErrorCode.PatientNotFound,
      params: { fileNo: '1' },
    });

    // A lot number typed wrong on delivery is put right on the batch.
    const fixed = (
      await asStaff(
        http().patch(`/api/inventory/items/${item.id}/lots/${later.id}`),
      )
        .send({ lotNumber: 'B-201' })
        .expect(200)
    ).body as ItemBody;
    expect(fixed.lots[1]).toMatchObject({ lotNumber: 'B-201', quantity: 3 });
    const clash = await asStaff(
      http().patch(`/api/inventory/items/${item.id}/lots/${later.id}`),
    )
      .send({ lotNumber: 'A-100', expiry: printed(30) })
      .expect(409);
    expect((clash.body as { code: string }).code).toBe(
      ErrorCode.InventoryLotExists,
    );

    // Corrected, never wiped: a batch with no lot or expiry cannot be traced.
    for (const wipe of [{ lotNumber: null }, { expiry: '' }]) {
      const refused = await asStaff(
        http().patch(`/api/inventory/items/${item.id}/lots/${later.id}`),
      )
        .send(wipe)
        .expect(400);
      expect((refused.body as { code: string }).code).toBe(
        ErrorCode.InventoryLotRequired,
      );
    }
    const kept = (
      await asStaff(http().get(`/api/inventory/items/${item.id}`)).expect(200)
    ).body as ItemBody;
    expect(kept.lots[1]).toMatchObject({
      lotNumber: 'B-201',
      expiry: printed(40),
    });
  });

  it('lets a batch on a plain item lose its lot, and an untraced implant batch gain one', async () => {
    const plain = await addItem({
      name: `plain-${runId}`,
      quantity: 2,
      lotNumber: 'P-1',
      expiry: printed(30),
    });
    const [plainLot] = plain.lots;
    const cleared = (
      await asStaff(
        http().patch(`/api/inventory/items/${plain.id}/lots/${plainLot.id}`),
      )
        .send({ lotNumber: null, expiry: null })
        .expect(200)
    ).body as ItemBody;
    expect(cleared.lots[0]).toMatchObject({ lotNumber: null, expiry: null });

    // As the workbook import can leave one: an implant batch with neither.
    // Opened as a plain item, since the app itself will not open it so.
    const implant = await addItem({ name: `untraced-${runId}`, quantity: 1 });
    await db.query(
      `UPDATE inventory_items SET category = 'implant' WHERE id = $1`,
      [implant.id],
    );
    const [bare] = implant.lots;
    const traced = (
      await asStaff(
        http().patch(`/api/inventory/items/${implant.id}/lots/${bare.id}`),
      )
        .send({ lotNumber: 'L-9' })
        .expect(200)
    ).body as ItemBody;
    expect(traced.lots[0]).toMatchObject({ lotNumber: 'L-9', expiry: null });
  });

  it('counts a shelf at once, setting reorder levels alongside', async () => {
    const shelf = `counted-${runId}`;
    const a = await addItem({ name: shelf, spec: '4x12', quantity: 5 });
    const b = await addItem({ name: shelf, spec: '4x14', quantity: 1 });
    const res = await asStaff(http().post('/api/inventory/items/count'))
      .send({
        lines: [
          { id: a.id, quantity: 3, minQuantity: 4 },
          { id: b.id, minQuantity: 2 },
        ],
      })
      .expect(200);
    expect(res.body).toEqual({ counted: 1, minimums: 2 });

    const after = await list({ q: shelf, filter: 'reorder' });
    expect(after.map((i) => [i.id, i.quantity, i.minQuantity])).toEqual([
      [a.id, 3, 4],
      [b.id, 1, 2],
    ]);

    // Saved whole or not at all: one bad line refuses the stocktake.
    await asStaff(http().post('/api/inventory/items/count'))
      .send({
        lines: [
          { id: a.id, quantity: 9 },
          { id: '00000000-0000-4000-8000-000000000000', quantity: 1 },
        ],
      })
      .expect(404);
    expect((await list({ q: shelf, filter: 'reorder' }))[0].quantity).toBe(3);
  });

  it('stores a brand and a size the standard way, however typed', async () => {
    const item = (await addItem({
      name: `std-${runId}`,
      category: 'implant',
      brand: 'دنتیوم',
      spec: '۴/۵ - ۱۰',
    })) as ItemBody & { brand: string; spec: string };
    expect(item).toMatchObject({ brand: 'Dentium', spec: '4.5x10' });

    const brands = (
      await asStaff(http().get('/api/inventory/items/brands')).expect(200)
    ).body as Array<{ name: string; spellings: string[] }>;
    expect(brands).toContainEqual(
      expect.objectContaining({
        name: 'Straumann',
        spellings: expect.arrayContaining(['اشترومن']),
      }),
    );
  });

  it('takes back the last movement, but not once the item has moved on', async () => {
    const item = await addItem({ name: `undo-${runId}`, quantity: 5 });
    const received = (
      await move(item.id, {
        kind: 'receive',
        quantity: 10,
        lotNumber: 'U-1',
        expiry: printed(20),
      }).expect(200)
    ).body as ItemBody;
    expect(received.quantity).toBe(15);

    const undone = (
      await asStaff(
        http().post(`/api/inventory/items/${item.id}/movements/undo`),
      )
        .send({ expectedVersion: received.version })
        .expect(200)
    ).body as ItemBody;
    // The delivery and the batch it opened are gone; the opening count stays.
    expect(undone.quantity).toBe(5);
    expect(undone.lots.map((l) => l.lotNumber)).toEqual([null]);
    expect(undone.movements.map((m) => m.kind)).toEqual(['count']);

    // A use split across batches is one movement, taken back whole.
    await move(item.id, { kind: 'use', quantity: 2 }).expect(200);
    const stale = await asStaff(
      http().post(`/api/inventory/items/${item.id}/movements/undo`),
    )
      .send({ expectedVersion: received.version })
      .expect(409);
    expect((stale.body as { code: string }).code).toBe(
      ErrorCode.InventoryItemModified,
    );
  });

  it('writes the day’s implants into the patient’s implant file as one follow-up, tooth by tooth, and takes each back on undo', async () => {
    const patient = await asStaff(http().post('/api/patients'))
      .send({ fileNo: `8${Date.now()}`, firstName: 'آزمون', lastName: 'کاشت' })
      .expect(201);
    const patientId = (patient.body as { id: string }).id;
    patientIds.push(patientId);
    implantCasePatients.push(patientId);
    const item = await addItem({
      name: `placed-${runId}`,
      category: 'implant',
      quantity: 3,
      lotNumber: 'P-1',
      expiry: printed(30),
    });
    const other = await addItem({
      name: `placed-other-${runId}`,
      category: 'implant',
      spec: '4.5x10',
      quantity: 1,
      lotNumber: 'P-2',
      expiry: printed(30),
    });

    const rows = () =>
      db.query<
        Array<{
          toothPosition: string;
          teethFdi: number[];
          implantBrand: string;
          followUpMonths: number;
          notes: string | null;
          inventoryMovementId: string | null;
        }>
      >(
        `SELECT s."toothPosition", s."teethFdi", s."implantBrand", s."followUpMonths", s.notes,
                s."inventoryMovementId"
           FROM surgery_queue s
           JOIN implant_cases c ON c.id = s."implantCaseId"
          WHERE c."patientId" = $1 AND s."deletedAt" IS NULL`,
        [patientId],
      );
    /** The patient's follow-ups as the list and the patient page read them. */
    const followUps = async () =>
      (
        (
          await asStaff(http().get('/api/surgery-queue'))
            .query({ patientId })
            .expect(200)
        ).body as {
          items: Array<{ teethFdi: number[]; implants: unknown[] }>;
        }
      ).items;
    const files = async () =>
      (
        await db.query<Array<{ active: number; all: number }>>(
          `SELECT count(*) FILTER (WHERE "deletedAt" IS NULL)::int AS active,
                  count(*)::int AS all
             FROM implant_cases WHERE "patientId" = $1`,
          [patientId],
        )
      )[0];

    // One implant into one tooth: two in one use is refused, either way.
    for (const twice of [
      { quantity: 2, tooth: '36 37' },
      { quantity: 1, tooth: '36 37' },
      { quantity: 2, tooth: '36' },
    ]) {
      const res = await move(item.id, {
        kind: 'use',
        patientId,
        ...twice,
      }).expect(400);
      expect((res.body as { code: string }).code).toBe(
        ErrorCode.InventoryImplantOneTooth,
      );
    }

    const used = (
      await move(item.id, {
        kind: 'use',
        quantity: 1,
        patientId,
        tooth: '۳۶',
      }).expect(200)
    ).body as ItemBody;
    expect(used.movements[0]).toMatchObject({ kind: 'use', change: -1 });

    // One implant, one surgery: prosthesis due in three months, and the box
    // listed from the stock card, not written into the notes.
    expect(await rows()).toEqual([
      expect.objectContaining({
        toothPosition: '36',
        teethFdi: [36],
        implantBrand: 'دنتیوم',
        followUpMonths: 3,
        notes: null,
      }),
    ]);
    const box = (tooth: number) => ({
      teeth: [tooth],
      name: `placed-${runId}`,
      brand: 'Dentium',
      spec: '4x10',
      lotNumber: 'P-1',
      quantity: 1,
      note: null,
    });
    expect((await followUps())[0].implants).toEqual([box(36)]);

    // The day's next implants are uses of their own, and join that row, each
    // saying which tooth took which box.
    const usedNext = (
      await move(item.id, {
        kind: 'use',
        quantity: 1,
        patientId,
        tooth: '37',
      }).expect(200)
    ).body as ItemBody;
    const usedOther = (
      await move(other.id, {
        kind: 'use',
        quantity: 1,
        patientId,
        tooth: '46',
        note: 'بارگذاری فوری',
      }).expect(200)
    ).body as ItemBody;
    expect(await rows()).toEqual([
      expect.objectContaining({
        toothPosition: '36 37 46',
        teethFdi: [36, 37, 46],
      }),
    ]);
    const otherBox = {
      teeth: [46],
      name: `placed-other-${runId}`,
      brand: 'Dentium',
      spec: '4.5x10',
      lotNumber: 'P-2',
      quantity: 1,
      note: 'بارگذاری فوری',
    };
    expect((await followUps())[0].implants).toEqual([
      box(36),
      box(37),
      otherBox,
    ]);

    // Taking back the day's second takes its tooth and box off the row…
    const undoneNext = (
      await asStaff(
        http().post(`/api/inventory/items/${item.id}/movements/undo`),
      )
        .send({ expectedVersion: usedNext.version })
        .expect(200)
    ).body as ItemBody;
    expect(await rows()).toEqual([
      expect.objectContaining({ toothPosition: '36 46', teethFdi: [36, 46] }),
    ]);
    expect((await followUps())[0].implants).toEqual([box(36), otherBox]);

    // …taking back the one that wrote it leaves it to the one still standing…
    await asStaff(http().post(`/api/inventory/items/${item.id}/movements/undo`))
      .send({ expectedVersion: undoneNext.version })
      .expect(200);
    const kept = await rows();
    expect(kept).toEqual([
      expect.objectContaining({ toothPosition: '46', teethFdi: [46] }),
    ]);
    expect(kept[0].inventoryMovementId).toBe(usedOther.movements[0].id);
    expect((await followUps())[0].implants).toEqual([otherBox]);
    expect(await files()).toEqual({ active: 1, all: 1 });

    // …and taking that one back too archives it, with the file the stock
    // opened alongside it: the patient is left without one.
    await asStaff(
      http().post(`/api/inventory/items/${other.id}/movements/undo`),
    )
      .send({ expectedVersion: usedOther.version })
      .expect(200);
    expect(await rows()).toHaveLength(0);
    expect(await files()).toEqual({ active: 0, all: 1 });

    // The next implant opens their file again.
    await move(item.id, {
      kind: 'use',
      quantity: 1,
      patientId,
      tooth: '36',
    }).expect(200);
    expect(await files()).toEqual({ active: 1, all: 2 });
    expect(await rows()).toHaveLength(1);
    await archive(item.id);
    await archive(other.id);
  });

  it('keeps a follow-up written by hand, and a file opened before, when the day’s implant is taken back', async () => {
    const patient = await asStaff(http().post('/api/patients'))
      .send({ fileNo: `5${Date.now()}`, firstName: 'آزمون', lastName: 'دستی' })
      .expect(201);
    const patientId = (patient.body as { id: string }).id;
    patientIds.push(patientId);
    implantCasePatients.push(patientId);
    const file = (
      await asStaff(http().post('/api/implant-cases'))
        .send({ patientId })
        .expect(201)
    ).body as { id: string };
    const written = (
      await asStaff(http().post('/api/surgery-queue'))
        .send({
          kind: 'implant',
          recordedName: 'آزمون دستی',
          patientId,
          implantCaseId: file.id,
          surgeryDate: formatJalali(new Date(), 'yyyy/MM/dd'),
          teethFdi: [36],
        })
        .expect(201)
    ).body as { id: string };
    const item = await addItem({
      name: `by-hand-${runId}`,
      category: 'implant',
      quantity: 1,
      lotNumber: 'H-1',
      expiry: printed(30),
    });

    const used = (
      await move(item.id, {
        kind: 'use',
        quantity: 1,
        patientId,
        tooth: '36',
      }).expect(200)
    ).body as ItemBody;
    const joined = (
      await asStaff(http().get(`/api/surgery-queue/${written.id}`)).expect(200)
    ).body as { teethFdi: number[]; implants: Array<{ lotNumber: string }> };
    expect(joined.teethFdi).toEqual([36]);
    expect(joined.implants.map((i) => i.lotNumber)).toEqual(['H-1']);

    await asStaff(http().post(`/api/inventory/items/${item.id}/movements/undo`))
      .send({ expectedVersion: used.version })
      .expect(200);
    const after = (
      await asStaff(http().get(`/api/surgery-queue/${written.id}`)).expect(200)
    ).body as { teethFdi: number[]; implants: unknown[] };
    expect(after).toMatchObject({ teethFdi: [36], implants: [] });
    await asStaff(http().get(`/api/implant-cases/${file.id}`)).expect(200);
    await archive(item.id);
  });

  it('will not hand out an implant without the patient it goes into', async () => {
    const item = await addItem({
      name: `unnamed-${runId}`,
      category: 'implant',
      quantity: 2,
      lotNumber: 'N-1',
      expiry: printed(30),
    });
    const res = await move(item.id, { kind: 'use', quantity: 1 }).expect(400);
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.InventoryPatientRequired,
    );
    // Nor without the tooth it goes into — one the chart can hold.
    const patient = await asStaff(http().post('/api/patients'))
      .send({ fileNo: `7${Date.now()}`, firstName: 'آزمون', lastName: 'دندان' })
      .expect(201);
    const patientId = (patient.body as { id: string }).id;
    patientIds.push(patientId);
    for (const tooth of [undefined, '', '19', 'بالا']) {
      const noTooth = await move(item.id, {
        kind: 'use',
        quantity: 1,
        patientId,
        tooth,
      }).expect(400);
      expect((noTooth.body as { code: string }).code).toBe(
        ErrorCode.InventoryToothRequired,
      );
    }
    // A box thrown away goes into nobody.
    const discarded = (
      await move(item.id, { kind: 'discard', quantity: 1 }).expect(200)
    ).body as ItemBody;
    expect(discarded.quantity).toBe(1);
    await archive(item.id);
  });

  it('asks who a membrane goes into, and nobody for bone powder from the same shelf', async () => {
    const membrane = await addItem({
      name: `ممبران ${runId}`,
      category: 'regenerative',
      brand: 'Regen',
      spec: '1x2',
      quantity: 2,
      lotNumber: 'M-1',
      expiry: printed(30),
    });
    expect(membrane).toMatchObject({ usedPerPatient: true });
    const refused = await move(membrane.id, {
      kind: 'use',
      quantity: 1,
    }).expect(400);
    expect((refused.body as { code: string }).code).toBe(
      ErrorCode.InventoryPatientRequired,
    );

    const powder = await addItem({
      name: `پودر استخوان ${runId}`,
      category: 'regenerative',
      brand: 'Regen',
      spec: '500-1000',
      quantity: 2,
      lotNumber: 'P-1',
      expiry: printed(30),
    });
    expect(powder).toMatchObject({ usedPerPatient: false });
    const used = (
      await move(powder.id, { kind: 'use', quantity: 1 }).expect(200)
    ).body as ItemBody;
    expect(used.quantity).toBe(1);

    await archive(membrane.id);
    await archive(powder.id);
  });

  it('names the patient a toothbrush was sold to on its stock card', async () => {
    const fileNo = `7${Date.now()}`;
    const patient = await asStaff(http().post('/api/patients'))
      .send({ fileNo, firstName: 'آزمون', lastName: 'فروش' })
      .expect(201);
    const patientId = (patient.body as { id: string }).id;
    patientIds.push(patientId);
    const item = await addItem({
      name: `sold-${runId}`,
      category: 'hygiene',
      brand: 'Oral-B',
      spec: 'Soft',
      quantity: 5,
      soldToPatients: true,
    });
    expect(item.soldToPatients).toBe(true);
    // Sold means sold to someone: the use names them.
    const nobody = await move(item.id, { kind: 'use', quantity: 1 }).expect(
      400,
    );
    expect((nobody.body as { code: string }).code).toBe(
      ErrorCode.InventoryPatientRequired,
    );

    const sold = (
      await move(item.id, { kind: 'use', quantity: 2, patientId }).expect(200)
    ).body as ItemBody;
    expect(sold.quantity).toBe(3);
    expect(sold.movements[0]).toMatchObject({
      kind: 'use',
      change: -2,
      patient: { id: patientId, fileNo, fullName: 'آزمون فروش' },
    });
    // Only an implant opens an implant file.
    const cases = await db.query<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM implant_cases WHERE "patientId" = $1`,
      [patientId],
    );
    expect(cases[0].n).toBe(0);

    // Switched off on the item, as for what the hygienist uses in the chair.
    const edited = (
      await asStaff(http().patch(`/api/inventory/items/${item.id}`))
        .send({ soldToPatients: false, expectedVersion: sold.version })
        .expect(200)
    ).body as ItemBody;
    expect(edited.soldToPatients).toBe(false);
    await archive(item.id);
  });

  it('will not hand out an expired implant unless its batch is picked', async () => {
    const patient = await asStaff(http().post('/api/patients'))
      .send({ fileNo: `6${Date.now()}`, firstName: 'آزمون', lastName: 'تاریخ' })
      .expect(201);
    const patientId = (patient.body as { id: string }).id;
    patientIds.push(patientId);
    implantCasePatients.push(patientId);
    const item = await addItem({
      name: `expired-${runId}`,
      category: 'implant',
      quantity: 1,
      lotNumber: 'OLD-1',
      expiry: printed(-2),
    });
    const res = await move(item.id, {
      kind: 'use',
      quantity: 1,
      patientId,
      tooth: '36',
    }).expect(409);
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.InventoryLotExpired,
    );
    await move(item.id, {
      kind: 'use',
      quantity: 1,
      lotId: item.lots[0].id,
      patientId,
      tooth: '36',
    }).expect(200);
    await archive(item.id);
  });

  it('will not count implants up into a batch with no lot', async () => {
    const item = await addItem({
      name: `uncounted-${runId}`,
      category: 'implant',
    });
    const res = await move(item.id, { kind: 'count', quantity: 2 }).expect(400);
    expect(res.body).toMatchObject({
      code: ErrorCode.InventoryCountUntraced,
      params: { id: item.id },
    });
    const opened = await asStaff(http().post('/api/inventory/items'))
      .send({
        category: 'implant',
        name: `unopened-${runId}`,
        brand: 'Dentium',
        spec: '4x10',
        quantity: 1,
      })
      .expect(400);
    expect((opened.body as { code: string }).code).toBe(
      ErrorCode.InventoryLotRequired,
    );
    await archive(item.id);
  });

  it('will not guess which batch extra implants belong to', async () => {
    const item = await addItem({
      name: `guessed-${runId}`,
      category: 'implant',
      quantity: 2,
      lotNumber: 'LOT-A',
      expiry: printed(24),
    });
    await move(item.id, {
      kind: 'receive',
      quantity: 3,
      lotNumber: 'LOT-B',
      expiry: printed(30),
    }).expect(200);

    // Two found over the record: the last batch in is not proof they are its.
    const res = await move(item.id, { kind: 'count', quantity: 7 }).expect(400);
    expect(res.body).toMatchObject({
      code: ErrorCode.InventoryCountUntraced,
      params: { id: item.id },
    });

    // Nor on a stocktake, which is refused whole.
    const plain = await addItem({ name: `guessed-${runId}`, quantity: 4 });
    const sheet = await asStaff(http().post('/api/inventory/items/count'))
      .send({
        lines: [
          { id: plain.id, quantity: 1 },
          { id: item.id, quantity: 6 },
        ],
      })
      .expect(400);
    expect(sheet.body).toMatchObject({
      code: ErrorCode.InventoryCountUntraced,
      params: { id: item.id },
    });
    const untouched = await list({ q: `guessed-${runId}` });
    expect(untouched.map((i) => [i.id, i.quantity]).sort()).toEqual(
      [
        [item.id, 5],
        [plain.id, 4],
      ].sort(),
    );

    // Fewer than recorded is still a count; the extra comes in as a delivery.
    await move(item.id, { kind: 'count', quantity: 4 }).expect(200);
    const received = (
      await move(item.id, {
        kind: 'receive',
        quantity: 2,
        lotNumber: 'LOT-C',
        expiry: printed(36),
      }).expect(200)
    ).body as ItemBody;
    expect(received.quantity).toBe(6);
    expect(received.lots.map((l) => [l.lotNumber, l.quantity]).sort()).toEqual(
      [
        ['LOT-A', 1],
        ['LOT-B', 3],
        ['LOT-C', 2],
      ].sort(),
    );
    await archive(item.id);
    await archive(plain.id);
  });

  it('will not receive an implant without its lot and expiry', async () => {
    const item = await addItem({ name: `lot-${runId}`, category: 'implant' });
    const res = await move(item.id, { kind: 'receive', quantity: 1 }).expect(
      400,
    );
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.InventoryLotRequired,
    );
  });

  it('refuses an expiry it cannot read, on the field', async () => {
    const res = await asStaff(http().post('/api/inventory/items'))
      .send({ category: 'other', name: `x-${runId}`, expiry: 'soon' })
      .expect(400);
    expect(res.body).toMatchObject({
      code: ErrorCode.ValidationFailed,
      fieldErrors: { expiry: [expect.objectContaining({ code: 'expiry' })] },
    });
  });

  it('answers the list’s questions: reorder, out, expiring', async () => {
    const low = await addItem({ spec: '5x8', quantity: 2, minQuantity: 3 });
    const out = await addItem({ spec: '5x10' });
    const expiring = await addItem({
      spec: '5x12',
      quantity: 1,
      expiry: printed(1),
    });

    const ids = (items: ItemBody[]) => items.map((i) => i.id);
    expect(ids(await list({ filter: 'reorder' }))).toEqual([low.id]);
    expect(ids(await list({ filter: 'out' }))).toEqual([out.id]);
    expect(ids(await list({ filter: 'expiry' }))).toEqual([expiring.id]);

    // Sizes are found however they are typed, and listed in numeric order.
    const all = await list({});
    expect(ids(await list({ q: `${runId} 5*12` }))).toEqual([expiring.id]);
    const specs = all.map((i) => (i as unknown as { spec: string }).spec);
    expect(specs.indexOf('5x8')).toBeLessThan(specs.indexOf('5x10'));

    const stats = (
      await asStaff(http().get('/api/stats/dashboard')).expect(200)
    ).body as Record<string, number>;
    expect(stats.inventoryReorder).toBeGreaterThanOrEqual(1);
    expect(stats.inventoryExpiring).toBeGreaterThanOrEqual(1);
  });

  it('refuses an edit loaded before a movement changed the item', async () => {
    const item = await addItem({ spec: '3.6x8', quantity: 4 });
    await move(item.id, { kind: 'use', quantity: 1 }).expect(200);
    const stale = await asStaff(http().patch(`/api/inventory/items/${item.id}`))
      .send({ minQuantity: 2, expectedVersion: item.version })
      .expect(409);
    expect((stale.body as { code: string }).code).toBe(
      ErrorCode.InventoryItemModified,
    );
  });

  it('archives an item out of the list and its movements, and restores it', async () => {
    const item = await addItem({ spec: '3.6x10', quantity: 1 });
    await asStaff(http().delete(`/api/inventory/items/${item.id}`)).expect(204);
    expect((await list({})).some((i) => i.id === item.id)).toBe(false);
    expect((await list({ archivedOnly: 'true' })).map((i) => i.id)).toContain(
      item.id,
    );
    await move(item.id, { kind: 'use', quantity: 1 }).expect(404);

    const restored = (
      await asStaff(
        http().post(`/api/inventory/items/${item.id}/restore`),
      ).expect(201)
    ).body as ItemBody;
    expect(restored).toMatchObject({ isArchived: false, quantity: 1 });
  });

  it('reports each month’s use per item, without discards or undone uses', async () => {
    // A name of its own: other tests use items too, and the search below must find only this one.
    const item = await addItem({ quantity: 20, name: `consumption-${runId}` });

    // A use last month: written now, then moved to the 10th of last month.
    await move(item.id, { kind: 'use', quantity: 4 }).expect(200);
    const lastMonth = setJalaliDate(addJalaliMonths(new Date(), -1), 10);
    lastMonth.setHours(12, 0, 0, 0);
    await db.query(
      `UPDATE inventory_movements SET "createdAt" = $2
        WHERE id = (SELECT id FROM inventory_movements
                     WHERE "itemId" = $1 AND kind = 'use' ORDER BY seq DESC LIMIT 1)`,
      [item.id, lastMonth],
    );

    // This month: two uses count; a discard is waste, and an undone use is gone.
    await move(item.id, { kind: 'use', quantity: 3 }).expect(200);
    await move(item.id, { kind: 'use', quantity: 2 }).expect(200);
    await move(item.id, { kind: 'discard', quantity: 1 }).expect(200);
    const mistaken = (
      await move(item.id, { kind: 'use', quantity: 5 }).expect(200)
    ).body as ItemBody;
    await asStaff(http().post(`/api/inventory/items/${item.id}/movements/undo`))
      .send({ expectedVersion: mistaken.version })
      .expect(200);

    const report = (
      await asViewer(http().get('/api/stats/consumption'))
        .query({ months: 6 })
        .expect(200)
    ).body as {
      months: Array<{ month: string; tracked: boolean; current: boolean }>;
      trackedFrom: string | null;
      items: Array<{ id: string; used: number[]; total: number; unit: string }>;
    };
    expect(report.months).toHaveLength(6);
    expect(report.months.at(-1)).toMatchObject({
      month: formatJalali(new Date(), 'yyyy/MM'),
      current: true,
      tracked: true,
    });
    expect(report.months.at(-2)?.month).toBe(
      formatJalali(lastMonth, 'yyyy/MM'),
    );
    expect(report.trackedFrom).not.toBeNull();
    const row = report.items.find((i) => i.id === item.id);
    expect(row).toMatchObject({
      used: [0, 0, 0, 0, 4, 5],
      total: 9,
      unit: 'piece',
    });

    // The stock list's search narrows it: to this item, or to nothing.
    const found = (
      await asStaff(http().get('/api/stats/consumption'))
        .query({ q: `consumption-${runId}` })
        .expect(200)
    ).body as { items: Array<{ id: string }> };
    expect(found.items.map((i) => i.id)).toEqual([item.id]);
    const none = (
      await asStaff(http().get('/api/stats/consumption'))
        .query({ q: `nothing-${runId}` })
        .expect(200)
    ).body as { items: unknown[] };
    expect(none.items).toEqual([]);

    // Only the windows the page offers.
    await asStaff(http().get('/api/stats/consumption'))
      .query({ months: 7 })
      .expect(400);
  });

  it('lets a viewer read the stock but not change it', async () => {
    const item = await addItem({ spec: '3.6x12', quantity: 1 });
    await asViewer(http().get('/api/inventory/items')).expect(200);
    await asViewer(http().post(`/api/inventory/items/${item.id}/movements`))
      .send({ kind: 'use', quantity: 1 })
      .expect(403);
    await asViewer(http().post('/api/inventory/items'))
      .send({ category: 'other', name: `viewer-${runId}` })
      .expect(403);
  });
});
