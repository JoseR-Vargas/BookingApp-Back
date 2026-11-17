import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminSessionController } from './admin-session.controller';

/** ADMIN_USERNAME enforced end to end on a real admin route. */
describe('Admin username over HTTP', () => {
  const KEY = 'username-test-key';
  const USERNAME = 'Admin';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let savedKey: string | undefined;
  let savedUsername: string | undefined;

  beforeAll(async () => {
    savedKey = process.env.ADMIN_API_KEY;
    savedUsername = process.env.ADMIN_USERNAME;
    process.env.ADMIN_API_KEY = KEY;
    process.env.ADMIN_USERNAME = USERNAME;
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminSessionController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (savedKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = savedKey;
    if (savedUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = savedUsername;
  });

  it('answers 200 with the key and the username', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/session')
      .set(auth)
      .set('X-Admin-Username', USERNAME)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('answers the same 401 for a missing and a wrong username', async () => {
    const missing = await request(app.getHttpServer())
      .get('/api/admin/session')
      .set(auth)
      .expect(401);
    const wrong = await request(app.getHttpServer())
      .get('/api/admin/session')
      .set(auth)
      .set('X-Admin-Username', 'admin')
      .expect(401);
    const wrongKey = await request(app.getHttpServer())
      .get('/api/admin/session')
      .set('Authorization', 'Bearer nope')
      .set('X-Admin-Username', USERNAME)
      .expect(401);
    expect(missing.body).toMatchObject({
      message: 'Invalid or missing admin key',
    });
    expect(wrong.body).toEqual(missing.body);
    expect(wrongKey.body).toEqual(missing.body);
  });
});
