import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    // Listening for the whole suite, on a free port. Left to itself the test
    // client starts the server for a request and closes it after, and a
    // request sent meanwhile is cut off: "socket hang up", in whichever test.
    await app.listen(0);
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect(({ body }: { body: { status: string; checkedAt: string } }) => {
        expect(body.status).toBe('ok');
        expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
