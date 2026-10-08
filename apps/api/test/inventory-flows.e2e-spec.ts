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
  stockState: 'ok' | 'low' | 'out';
  expiry: string | null;
  expiryState: 'ok' | 'expiring' | 'expired' | null;
  version: number;
  isArchived: boolean;
  movements: Array<{
    kind: string;
    change: number;
    quantityAfter: number;
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

  /** An implant of this run's own line, so its rows never mix with anything else. */
  async function addItem(
    body: Record<string, unknown> = {},
  ): Promise<ItemBody> {
    const res = await asStaff(http().post('/api/inventory/items'))
      .send({
        category: 'implant',
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

  const move = (id: string, body: Record<string, unknown>) =>
    asStaff(http().post(`/api/inventory/items/${id}/movements`)).send(body);

  const list = async (query: Record<string, string>): Promise<ItemBody[]> =>
    (
      await asStaff(http().get('/api/inventory/items'))
        .query({ q: runId, ...query })
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
        category: 'implant',
        name: `LINE-${runId}`,
        brand: 'dentium',
        spec: '4 x 10',
      })
      .expect(409);
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.InventoryItemExists,
    );
  });

  it('receives, uses and counts, keeping the nearest expiry on the shelf', async () => {
    const item = await addItem({
      spec: '4.5x8',
      quantity: 2,
      expiry: printed(12),
    });

    const received = (
      await move(item.id, {
        kind: 'receive',
        quantity: 10,
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
    expect(counted.movements.map((m) => [m.kind, m.change])).toEqual([
      ['count', -1],
      ['use', -3],
      ['receive', 10],
      ['count', 2],
    ]);
    expect(counted.movements[2]).toMatchObject({
      note: 'فاکتور ۱۲',
      by: 'e2e receptionist',
    });

    // Something has to move; only a count may find the shelf empty.
    await move(item.id, { kind: 'receive', quantity: 0 }).expect(400);
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
