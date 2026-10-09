import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { addMonths, format } from 'date-fns';

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
  lots: Array<{
    id: string;
    lotNumber: string | null;
    expiry: string | null;
    quantity: number;
  }>;
  movements: Array<{
    kind: string;
    change: number;
    quantityAfter: number;
    lotNumber: string | null;
    patient: { id: string; fileNo: string } | null;
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
      }).expect(200)
    ).body as ItemBody;
    expect(body.movements[0]).toMatchObject({
      kind: 'use',
      change: -1,
      lotNumber: 'B-200',
      patient: { fileNo },
    });

    const tooMany = await move(item.id, {
      kind: 'use',
      quantity: 4,
      lotId: later.id,
    }).expect(409);
    expect(tooMany.body).toMatchObject({
      code: ErrorCode.InventoryInsufficientStock,
      params: { available: 3 },
    });

    const unknown = await move(item.id, {
      kind: 'use',
      quantity: 1,
      patientFileNo: '1',
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

  it('writes implants handed to a patient into their implant file, and takes them back on undo', async () => {
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

    const used = (
      await move(item.id, {
        kind: 'use',
        quantity: 2,
        patientId,
        tooth: '۳۶ 37',
      }).expect(200)
    ).body as ItemBody;
    expect(used.movements[0]).toMatchObject({ kind: 'use', change: -2 });

    const rows = await db.query<
      Array<{
        toothPosition: string;
        implantBrand: string;
        followUpMonths: number;
        notes: string;
        patientId: string;
        deletedAt: Date | null;
      }>
    >(
      `SELECT s."toothPosition", s."implantBrand", s."followUpMonths", s.notes,
              c."patientId", s."deletedAt"
         FROM surgery_queue s
         JOIN implant_cases c ON c.id = s."implantCaseId"
         JOIN inventory_movements m ON m.id = s."inventoryMovementId"
        WHERE m."itemId" = $1
        ORDER BY s."toothPosition"`,
      [item.id],
    );
    // One row per implant, each its own tooth, prosthesis due in three months.
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.toothPosition)).toEqual(['36', '37']);
    expect(rows[0]).toMatchObject({
      implantBrand: 'دنتیوم',
      followUpMonths: 3,
      notes: `placed-${runId} · 4x10 · LOT P-1`,
      patientId,
      deletedAt: null,
    });

    await asStaff(http().post(`/api/inventory/items/${item.id}/movements/undo`))
      .send({ expectedVersion: used.version })
      .expect(200);
    const left = await db.query<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM surgery_queue s
         JOIN implant_cases c ON c.id = s."implantCaseId"
        WHERE c."patientId" = $1 AND s."deletedAt" IS NULL`,
      [patientId],
    );
    expect(left[0].n).toBe(0);
    await archive(item.id);
  });

  it('will not hand out an expired implant unless its batch is picked', async () => {
    const item = await addItem({
      name: `expired-${runId}`,
      category: 'implant',
      quantity: 1,
      lotNumber: 'OLD-1',
      expiry: printed(-2),
    });
    const res = await move(item.id, { kind: 'use', quantity: 1 }).expect(409);
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.InventoryLotExpired,
    );
    await move(item.id, {
      kind: 'use',
      quantity: 1,
      lotId: item.lots[0].id,
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
