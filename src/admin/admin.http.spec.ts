import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DomainErrorFilter } from '../shared/infrastructure/http/domain-error.filter';
import * as request from 'supertest';
import { AdminSessionController } from '../auth/admin-session.controller';
import { CatalogController } from '../catalog/catalog.controller';
import {
  createFakeCatalog,
  createFakeModel,
  CATALOG_ROUTE_CONTROLLERS,
} from '../catalog/catalog.testing';
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
      controllers: [
        AdminController,
        AdminSessionController,
        CatalogController,
        ...CATALOG_ROUTE_CONTROLLERS,
      ],
      providers: [
        ...fake.providers,
        {
          provide: ScheduleImpactService,
          useValue: new ScheduleImpactService(bookings as never),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorFilter());
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
      locations: ['principal'],
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

  describe('PUT /api/admin/schedule start interval', () => {
    const weekly = {
      0: { closed: true },
      1: { closed: false, open: '09:00', close: '20:00' },
      2: { closed: false, open: '09:00', close: '20:00' },
      3: { closed: false, open: '09:00', close: '20:00' },
      4: { closed: false, open: '09:00', close: '20:00' },
      5: { closed: false, open: '09:00', close: '20:00' },
      6: { closed: true },
    };
    const MESSAGE =
      'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.';
    const put = (body: object) =>
      request(app.getHttpServer())
        .put('/api/admin/schedule')
        .set(auth)
        .send(body);

    it('stores and returns 180, keeps it when omitted, and both catalogs show it', async () => {
      const saved = await put({ weekly, startIntervalMinutes: 180 }).expect(
        200,
      );
      expect(saved.body.schedule).toEqual({
        weekly,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 180,
      });

      const omitted = await put({ weekly }).expect(200);
      expect(omitted.body.schedule.startIntervalMinutes).toBe(180);

      const publicCatalog = await request(app.getHttpServer())
        .get('/api/catalog')
        .expect(200);
      expect(publicCatalog.body.schedule.startIntervalMinutes).toBe(180);
      const adminCatalog = await request(app.getHttpServer())
        .get('/api/admin/catalog')
        .set(auth)
        .expect(200);
      expect(adminCatalog.body.schedule.startIntervalMinutes).toBe(180);
    });

    it.each([45, 0, 500, 'abc', null, 1.5])(
      'rejects %p with the exact message and keeps the stored value',
      async (value) => {
        const res = await put({ weekly, startIntervalMinutes: value }).expect(
          400,
        );
        expect(res.body.message).toBe(MESSAGE);

        const catalog = await request(app.getHttpServer())
          .get('/api/catalog')
          .expect(200);
        expect(catalog.body.schedule.startIntervalMinutes).toBe(180);
      },
    );
  });

  describe('PUT /api/admin/schedule starts per day', () => {
    const week = (monday: object) => ({
      0: { closed: true },
      1: monday,
      2: { closed: false, open: '09:00', close: '20:00' },
      3: { closed: false, open: '09:00', close: '20:00' },
      4: { closed: false, open: '09:00', close: '20:00' },
      5: { closed: false, open: '09:00', close: '20:00' },
      6: { closed: true },
    });
    const open = { closed: false, open: '09:00', close: '20:00' };
    const put = (weekly: object) =>
      request(app.getHttpServer())
        .put('/api/admin/schedule')
        .set(auth)
        .send({ weekly });

    it('stores the starts sorted, both catalogs return them, and an omitted list clears them', async () => {
      const saved = await put(
        week({ ...open, starts: ['16:00', '09:00', '12:00'] }),
      ).expect(200);
      expect(saved.body.schedule.weekly[1].starts).toEqual([
        '09:00',
        '12:00',
        '16:00',
      ]);
      expect(saved.body.schedule.weekly[2]).not.toHaveProperty('starts');

      const publicCatalog = await request(app.getHttpServer())
        .get('/api/catalog')
        .expect(200);
      expect(publicCatalog.body.schedule.weekly[1].starts).toEqual([
        '09:00',
        '12:00',
        '16:00',
      ]);
      const adminCatalog = await request(app.getHttpServer())
        .get('/api/admin/catalog')
        .set(auth)
        .expect(200);
      expect(adminCatalog.body.schedule.weekly[1].starts).toEqual([
        '09:00',
        '12:00',
        '16:00',
      ]);

      const cleared = await put(week(open)).expect(200);
      expect(cleared.body.schedule.weekly[1]).not.toHaveProperty('starts');
    });

    it.each([
      [
        [],
        'Las horas de inicio de cada día deben ser una lista sin repetidos de horas HH:mm.',
      ],
      [
        ['10:00', '10:00'],
        'Las horas de inicio de cada día deben ser una lista sin repetidos de horas HH:mm.',
      ],
      [
        ['10:15'],
        'Las horas de inicio deben estar dentro del horario del día y ser múltiplos de 30 minutos.',
      ],
      [
        ['20:00'],
        'Las horas de inicio deben estar dentro del horario del día y ser múltiplos de 30 minutos.',
      ],
    ])('rejects %p with 400', async (starts, message) => {
      const res = await put(week({ ...open, starts })).expect(400);
      expect(res.body.message).toBe(message);
    });

    it('answers 401 without the admin key', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/schedule')
        .send({ weekly: week(open) })
        .expect(401);
    });
  });

  describe('PUT /api/admin/public-availability', () => {
    const put = (body: object) =>
      request(app.getHttpServer())
        .put('/api/admin/public-availability')
        .set(auth)
        .send(body);

    it('reads as the default, stores the settings and returns them in the admin catalog', async () => {
      const before = await request(app.getHttpServer())
        .get('/api/admin/catalog')
        .set(auth)
        .expect(200);
      expect(before.body.publicAvailability).toEqual({
        enabled: false,
        days: 7,
        serviceIds: null,
      });

      const saved = await put({
        enabled: true,
        days: 5,
        serviceIds: ['servicio-basico'],
      }).expect(200);
      expect(saved.body).toEqual({
        publicAvailability: {
          enabled: true,
          days: 5,
          serviceIds: ['servicio-basico'],
        },
      });

      const after = await request(app.getHttpServer())
        .get('/api/admin/catalog')
        .set(auth)
        .expect(200);
      expect(after.body.publicAvailability.days).toBe(5);
    });

    it.each([
      [
        { enabled: 'yes', days: 7, serviceIds: null },
        'El estado de la página pública debe ser verdadero o falso.',
      ],
      [
        { enabled: true, days: 15, serviceIds: null },
        'La cantidad de días debe ser un entero entre 1 y 14.',
      ],
      [
        { enabled: true, days: 7, serviceIds: [] },
        'Los servicios publicados deben ser null (todos) o una lista sin repetidos con al menos un servicio.',
      ],
      [
        { enabled: true, days: 7, serviceIds: ['nope'] },
        'Alguno de los servicios publicados no existe.',
      ],
    ])('rejects %j with 400', async (body, message) => {
      const res = await put(body).expect(400);
      expect(res.body.message).toBe(message);
    });

    it('answers 401 without the admin key', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/public-availability')
        .send({ enabled: true, days: 7, serviceIds: null })
        .expect(401);
    });
  });
});
