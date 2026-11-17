import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminSessionController } from '../auth/admin-session.controller';
import { CatalogAdminService } from '../catalog/catalog-admin.service';
import { CatalogService } from '../catalog/catalog.service';
import { createFakeCatalog, createFakeModel } from '../catalog/catalog.testing';
import { AdminController } from './admin.controller';
import { ScheduleImpactService } from './schedule-impact';

/** End-to-end over HTTP with in-memory models: guard, routing, status codes. */
describe('Admin HTTP contract', () => {
  const KEY = 'http-test-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let saved: string | undefined;
  let bookings: ReturnType<typeof createFakeModel>;

  beforeAll(async () => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    const fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    // The fake model ignores range operators ($gte/$ne); `isOutsideSchedule`
    // is what decides the count.
    bookings = createFakeModel([
      {
        date: '2999-01-04',
        time: '10:00',
        slots: ['10:00'],
        status: 'confirmed',
      },
      {
        date: '2999-01-05',
        time: '10:00',
        slots: ['10:00'],
        status: 'confirmed',
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController, AdminSessionController],
      providers: [
        { provide: CatalogService, useValue: fake.catalog },
        {
          provide: CatalogAdminService,
          useValue: new CatalogAdminService(
            fake.professionalModel,
            fake.serviceModel,
            fake.settingsModel,
          ),
        },
        {
          provide: ScheduleImpactService,
          useValue: new ScheduleImpactService(bookings as never),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  const routes: [string, string][] = [
    ['get', '/api/admin/session'],
    ['get', '/api/admin/catalog'],
    ['post', '/api/admin/professionals'],
    ['patch', '/api/admin/professionals/alex-garcia'],
    ['delete', '/api/admin/professionals/alex-garcia'],
    ['post', '/api/admin/services'],
    ['patch', '/api/admin/services/servicio-basico'],
    ['delete', '/api/admin/services/servicio-basico'],
    ['put', '/api/admin/schedule'],
  ];

  it.each(routes)('%s %s answers 401 without a key', async (method, path) => {
    await (request(app.getHttpServer()) as any)[method](path).expect(401);
  });

  it.each(routes)(
    '%s %s answers 401 with a wrong key',
    async (method, path) => {
      await (request(app.getHttpServer()) as any)
        [method](path)
        .set('Authorization', 'Bearer nope')
        .expect(401);
    },
  );

  it('answers 401 everywhere when ADMIN_API_KEY is unset', async () => {
    delete process.env.ADMIN_API_KEY;
    try {
      await request(app.getHttpServer())
        .get('/api/admin/session')
        .set('Authorization', 'Bearer ')
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/admin/catalog')
        .set(auth)
        .expect(401);
    } finally {
      process.env.ADMIN_API_KEY = KEY;
    }
  });

  it('GET /api/admin/session -> 200 { ok: true }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/session')
      .set(auth)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /api/admin/catalog -> seeded data with active flags', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/catalog')
      .set(auth)
      .expect(200);
    expect(res.body.professionals).toHaveLength(2);
    expect(res.body.services).toHaveLength(4);
    expect(res.body.professionals[0].active).toBe(true);
    expect(res.body.schedule.slotIntervalMinutes).toBe(30);
  });

  it('professional lifecycle: create (201), patch, delete (soft), reactivate, 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/professionals')
      .set(auth)
      .send({ name: 'Zoe Díaz', specialty: 'Stylist', experience: '2 años' })
      .expect(201);
    expect(created.body).toEqual({
      id: 'zoe-diaz',
      name: 'Zoe Díaz',
      specialty: 'Stylist',
      experience: '2 años',
      rating: 5,
      avatar: 'fas fa-user',
      photoUrl: null,
      active: true,
    });

    const patched = await request(app.getHttpServer())
      .patch('/api/admin/professionals/zoe-diaz')
      .set(auth)
      .send({ experience: '3 años' })
      .expect(200);
    expect(patched.body.experience).toBe('3 años');

    const deleted = await request(app.getHttpServer())
      .delete('/api/admin/professionals/zoe-diaz')
      .set(auth)
      .expect(200);
    expect(deleted.body).toMatchObject({ id: 'zoe-diaz', active: false });

    const back = await request(app.getHttpServer())
      .patch('/api/admin/professionals/zoe-diaz')
      .set(auth)
      .send({ active: true })
      .expect(200);
    expect(back.body.active).toBe(true);

    await request(app.getHttpServer())
      .patch('/api/admin/professionals/nobody')
      .set(auth)
      .send({ name: 'x' })
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/admin/professionals/nobody')
      .set(auth)
      .expect(404);
  });

  it('service lifecycle with validation errors', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set(auth)
      .send({
        name: 'Tinte',
        description: 'Color completo',
        price: 3000,
        duration: 120,
        professionals: ['alex-garcia'],
      })
      .expect(201);
    expect(created.body).toMatchObject({
      id: 'tinte',
      icon: 'fas fa-star',
      active: true,
    });

    for (const bad of [
      { price: -1 },
      { duration: 4 },
      { duration: 481 },
      { professionals: [] },
      { professionals: ['ghost'] },
    ]) {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/services/tinte')
        .set(auth)
        .send(bad)
        .expect(400);
      expect(typeof res.body.message).toBe('string');
    }

    await request(app.getHttpServer())
      .post('/api/admin/services')
      .set(auth)
      .send({ name: 'Sin datos' })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/admin/services/tinte')
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/admin/services/ghost')
      .set(auth)
      .send({ price: 1 })
      .expect(404);
  });

  it('PUT /api/admin/schedule saves and counts affected bookings; invalid -> 400', async () => {
    const weekly = {
      0: { closed: true },
      1: { closed: false, open: '09:00', close: '20:00' },
      2: { closed: false, open: '09:00', close: '20:00' },
      3: { closed: false, open: '09:00', close: '20:00' },
      4: { closed: false, open: '09:00', close: '20:00' },
      5: { closed: false, open: '09:00', close: '20:00' },
      6: { closed: false, open: '09:00', close: '18:00' },
    };
    // 2999-01-04 is a Friday and 2999-01-05 a Saturday; closing Saturday
    // leaves only the Saturday booking out of hours.
    const res = await request(app.getHttpServer())
      .put('/api/admin/schedule')
      .set(auth)
      .send({ weekly: { ...weekly, 6: { closed: true } } })
      .expect(200);
    expect(res.body.schedule.weekly[6]).toEqual({ closed: true });
    expect(res.body.schedule.slotIntervalMinutes).toBe(30);
    expect(res.body.affectedBookings).toBe(1);

    const invalid = await request(app.getHttpServer())
      .put('/api/admin/schedule')
      .set(auth)
      .send({
        weekly: {
          ...weekly,
          1: { closed: false, open: '10:15', close: '18:00' },
        },
      })
      .expect(400);
    expect(invalid.body.message).toMatch(/HH:mm/);

    const catalog = await request(app.getHttpServer())
      .get('/api/admin/catalog')
      .set(auth)
      .expect(200);
    expect(catalog.body.schedule.weekly[6]).toEqual({ closed: true });
  });
});
