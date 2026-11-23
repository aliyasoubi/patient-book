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
 * The price list over HTTP against a real database: a line added, its price
 * changed and its range checked, two edits at once refused, and the line
 * removed. Same guard as clinic-flows: only a throwaway database (`*_e2e`,
 * `*_test`, or CI) is ever written to.
 */
const dbName = process.env.DB_NAME ?? '';
const writable = process.env.CI === 'true' || /(_e2e|_test)$/.test(dbName);
const describeIfWritable = writable ? describe : describe.skip;
if (!writable) {
  console.warn(
    `tariff-flows.e2e-spec: skipped — DB_NAME="${dbName}" is not a throwaway database.`,
  );
}

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

interface TariffBody {
  id: string;
  category: string;
  title: string;
  price: number | null;
  maxPrice: number | null;
  note: string | null;
  version: number;
}

describeIfWritable('tariff flows (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let staffToken: string;
  let viewerToken: string;

  const staffUsername = `e2e-tariff-reception-${runId}`;
  const viewerUsername = `e2e-tariff-viewer-${runId}`;
  // Fixture credentials for this run only; never a real account's.
  const password = `E2e!${runId}Pass`;
  const userIds: string[] = [];
  const tariffIds: string[] = [];

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

  async function add(body: Record<string, unknown>): Promise<TariffBody> {
    const res = await asStaff(http().post('/api/tariffs'))
      .send(body)
      .expect(201);
    const saved = res.body as TariffBody;
    tariffIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
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
    if (tariffIds.length) {
      await db.query(`DELETE FROM tariffs WHERE id = ANY($1)`, [tariffIds]);
    }
    if (userIds.length) {
      await db.query(`DELETE FROM audit_logs WHERE "userId" = ANY($1)`, [
        userIds,
      ]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
    await app.close();
  });

  it('adds a line at the end of the list, prices beyond an int and all', async () => {
    const saved = await add({
      category: `آزمون ${runId}`,
      title: `ارتودنسی آزمون ${runId}`,
      price: 1_500_000_000,
      maxPrice: 3_000_000_000,
      note: 'هر فک',
    });
    expect(saved).toMatchObject({
      price: 1_500_000_000,
      maxPrice: 3_000_000_000,
      note: 'هر فک',
      version: 1,
    });

    const list = (await asViewer(http().get('/api/tariffs')).expect(200))
      .body as TariffBody[];
    expect(list.at(-1)?.id).toBe(saved.id);
  });

  it('keeps one line per service, however its title is spelt', async () => {
    await add({ category: `آزمون ${runId}`, title: `جرم‌گیری ${runId}` });
    const res = await asStaff(http().post('/api/tariffs'))
      .send({ category: `آزمون ${runId}`, title: `جرم گیري ${runId}` })
      .expect(409);
    expect((res.body as { code: string }).code).toBe(
      ErrorCode.TariffTitleTaken,
    );
  });

  it('files a heading typed another way under the one already there', async () => {
    const heading = `آزمون‌ها ${runId}`;
    const saved = await add({ category: heading, title: `بلیچینگ ${runId}` });
    expect(saved.category).toBe(heading);
    const second = await add({
      category: `آزمون ها ${runId}`,
      title: `بلیچینگ خانگی ${runId}`,
    });
    expect(second.category).toBe(heading);
  });

  it('changes a price, refuses a stale edit and a broken range', async () => {
    const line = await add({
      category: `آزمون ${runId}`,
      title: `کشیدن ${runId}`,
      price: 100_000_000,
      maxPrice: 160_000_000,
    });

    const updated = (
      await asStaff(http().patch(`/api/tariffs/${line.id}`))
        .send({ price: 120_000_000, expectedVersion: line.version })
        .expect(200)
    ).body as TariffBody;
    expect(updated).toMatchObject({
      price: 120_000_000,
      maxPrice: 160_000_000,
      version: line.version + 1,
    });

    const stale = await asStaff(http().patch(`/api/tariffs/${line.id}`))
      .send({ price: 130_000_000, expectedVersion: line.version })
      .expect(409);
    expect((stale.body as { code: string }).code).toBe(
      ErrorCode.TariffModified,
    );

    const below = await asStaff(http().patch(`/api/tariffs/${line.id}`))
      .send({ maxPrice: 110_000_000, expectedVersion: updated.version })
      .expect(400);
    expect((below.body as { code: string }).code).toBe(
      ErrorCode.TariffRangeInvalid,
    );

    // The same figure at both ends is one price.
    const single = (
      await asStaff(http().patch(`/api/tariffs/${line.id}`))
        .send({ maxPrice: 120_000_000, expectedVersion: updated.version })
        .expect(200)
    ).body as TariffBody;
    expect(single).toMatchObject({ price: 120_000_000, maxPrice: null });
  });

  it('lets a viewer read the list but not change it, and removes a line', async () => {
    const line = await add({
      category: `آزمون ${runId}`,
      title: `لمینت ${runId}`,
    });
    await asViewer(http().patch(`/api/tariffs/${line.id}`))
      .send({ price: 1, expectedVersion: line.version })
      .expect(403);

    await asStaff(http().delete(`/api/tariffs/${line.id}`)).expect(204);
    const list = (await asStaff(http().get('/api/tariffs')).expect(200))
      .body as TariffBody[];
    expect(list.some((t) => t.id === line.id)).toBe(false);
    await asStaff(http().delete(`/api/tariffs/${line.id}`)).expect(404);
  });
});
