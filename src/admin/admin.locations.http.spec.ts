import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CatalogAdminService } from '../catalog/catalog-admin.service';
import { CatalogController } from '../catalog/catalog.controller';
import { SCHEDULE } from '../catalog/catalog.config';
import { CatalogService } from '../catalog/catalog.service';
import { createFakeCatalog, createFakeModel } from '../catalog/catalog.testing';
import { AdminController } from './admin.controller';
import { ScheduleImpactService } from './schedule-impact';

/** Admin locations over HTTP with in-memory models (S6, S7). */
describe('Admin locations HTTP contract', () => {
  const KEY = 'locations-test-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let fake: ReturnType<typeof createFakeCatalog>;
  let saved: string | undefined;

  const http = () => request(app.getHttpServer());

  // 2999-01-06 is a Sunday, closed in the seed schedule.
  const booking = (extra: object) => ({
    date: '2999-01-06',
    time: '10:00',
    slots: ['10:00'],
    status: 'confirmed',
    ...extra,
  });

  beforeEach(async () => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    const bookings = createFakeModel([
      // Legacy booking without location: counts for the default location.
      booking({}),
      booking({ location: { id: 'principal', name: 'Principal' } }),
      booking({ location: { id: 'centro', name: 'Centro' } }),
      booking({ location: { id: 'centro', name: 'Centro' } }),
      booking({
        location: { id: 'centro', name: 'Centro' },
        status: 'cancelled',
      }),
    ]);
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController, CatalogController],
      providers: [
        { provide: CatalogService, useValue: fake.catalog },
        {
          provide: CatalogAdminService,
          useValue: new CatalogAdminService(
            fake.professionalModel,
            fake.serviceModel,
            fake.settingsModel,
            fake.bookingModel,
            fake.locationModel,
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

  afterEach(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  const createCentro = () =>
    http()
      .post('/api/admin/locations')
      .set(auth)
      .send({ name: 'Centro', address: 'Av. Central 123' });

  describe('authentication', () => {
    const routes: [string, string][] = [
      ['post', '/api/admin/locations'],
      ['put', '/api/admin/locations/principal'],
      ['put', '/api/admin/locations/principal/schedule'],
    ];

    it.each(routes)('%s %s answers 401 without a key', async (method, path) => {
      await (http() as any)[method](path).expect(401);
    });
  });

  describe('POST /api/admin/locations', () => {
    it('creates a location (201) with the seed schedule and a slug id', async () => {
      const res = await createCentro().expect(201);

      expect(res.body).toEqual({
        id: 'centro',
        name: 'Centro',
        address: 'Av. Central 123',
        active: true,
        schedule: {
          weekly: SCHEDULE.weekly,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 30,
        },
      });
      expect(fake.locationModel.docs.map((d) => d.id)).toEqual([
        'principal',
        'centro',
      ]);
    });

    it('defaults the address to an empty string and trims the name', async () => {
      const res = await http()
        .post('/api/admin/locations')
        .set(auth)
        .send({ name: '  Sur  ' })
        .expect(201);

      expect(res.body).toMatchObject({ id: 'sur', name: 'Sur', address: '' });
    });

    it('keeps ids unique: a second "Centro" becomes centro-2, and "Principal" never collides', async () => {
      await createCentro().expect(201);
      const second = await createCentro().expect(201);
      const principal = await http()
        .post('/api/admin/locations')
        .set(auth)
        .send({ name: 'Principal', address: '' })
        .expect(201);

      expect(second.body.id).toBe('centro-2');
      expect(principal.body.id).toBe('principal-2');
      expect(fake.locationModel.docs).toHaveLength(4);
    });

    it.each([
      [
        { name: '' },
        'El nombre del local es obligatorio (máximo 80 caracteres).',
      ],
      [
        { name: '   ' },
        'El nombre del local es obligatorio (máximo 80 caracteres).',
      ],
      [{}, 'El nombre del local es obligatorio (máximo 80 caracteres).'],
      [
        { name: 7 },
        'El nombre del local es obligatorio (máximo 80 caracteres).',
      ],
      [
        { name: 'x'.repeat(81) },
        'El nombre del local es obligatorio (máximo 80 caracteres).',
      ],
      [
        { name: 'Centro', address: 'x'.repeat(201) },
        'La dirección del local no puede superar los 200 caracteres.',
      ],
      [
        { name: 'Centro', address: 5 },
        'La dirección del local no puede superar los 200 caracteres.',
      ],
    ])('rejects %j with 400 and stores nothing', async (body, message) => {
      const res = await http()
        .post('/api/admin/locations')
        .set(auth)
        .send(body)
        .expect(400);

      expect(res.body.message).toBe(message);
      expect(fake.locationModel.docs).toHaveLength(1);
    });

    it('accepts the limits: an 80-character name and a 200-character address', async () => {
      await http()
        .post('/api/admin/locations')
        .set(auth)
        .send({ name: 'x'.repeat(80), address: 'y'.repeat(200) })
        .expect(201);
    });
  });

  describe('PUT /api/admin/locations/:id', () => {
    it('updates name, address and active; the id never changes', async () => {
      await createCentro().expect(201);

      const res = await http()
        .put('/api/admin/locations/centro')
        .set(auth)
        .send({ name: 'Centro Histórico', address: 'Calle 5', active: false })
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'centro',
        name: 'Centro Histórico',
        address: 'Calle 5',
        active: false,
      });
      expect(res.body.schedule.startIntervalMinutes).toBe(30);
    });

    it('answers 404 for an unknown location', async () => {
      const res = await http()
        .put('/api/admin/locations/nope')
        .set(auth)
        .send({ name: 'x', address: '', active: true })
        .expect(404);

      expect(res.body.message).toBe('Location "nope" not found');
    });

    it('validates like create and leaves the stored location unchanged', async () => {
      const bad = await http()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ name: '', address: '', active: true })
        .expect(400);
      expect(bad.body.message).toBe(
        'El nombre del local es obligatorio (máximo 80 caracteres).',
      );
      await http()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ name: 'Principal', address: 'x'.repeat(201), active: true })
        .expect(400);

      expect(fake.locationModel.docs[0]).toMatchObject({
        name: 'Principal',
        address: '',
      });
    });

    it('cannot deactivate the last active location', async () => {
      const res = await http()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ name: 'Principal', address: '', active: false })
        .expect(400);

      expect(res.body.message).toBe('Debe quedar al menos un local activo.');
      expect(fake.locationModel.docs[0].active).toBe(true);
    });

    it('can deactivate one while another stays active, but not the remaining one', async () => {
      await createCentro().expect(201);

      await http()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ name: 'Principal', address: '', active: false })
        .expect(200);
      const res = await http()
        .put('/api/admin/locations/centro')
        .set(auth)
        .send({ name: 'Centro', address: '', active: false })
        .expect(400);

      expect(res.body.message).toBe('Debe quedar al menos un local activo.');
      expect(fake.locationModel.docs.map((d) => [d.id, d.active])).toEqual([
        ['principal', false],
        ['centro', true],
      ]);
    });

    it('reactivating an inactive location is allowed', async () => {
      await createCentro().expect(201);
      await http()
        .put('/api/admin/locations/centro')
        .set(auth)
        .send({ name: 'Centro', address: '', active: false })
        .expect(200);

      await http()
        .put('/api/admin/locations/centro')
        .set(auth)
        .send({ name: 'Centro', address: '', active: true })
        .expect(200);
    });
  });

  describe('PUT /api/admin/locations/:id/schedule', () => {
    const weekly = {
      ...SCHEDULE.weekly,
      0: { closed: false, open: '09:00', close: '12:00' }, // opens the Sunday
    };

    it('saves that location only and counts only its own bookings that no longer fit', async () => {
      await createCentro().expect(201);
      // Centro: closed on Sunday (seed). Its two confirmed Sunday bookings
      // are out of hours; the cancelled one, and the other locations', never count.
      const res = await http()
        .put('/api/admin/locations/centro/schedule')
        .set(auth)
        .send({ weekly: SCHEDULE.weekly, startIntervalMinutes: 60 })
        .expect(200);

      expect(res.body).toEqual({
        schedule: {
          weekly: SCHEDULE.weekly,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 60,
        },
        affectedBookings: 2,
      });
      expect(fake.locationModel.docs[1].startIntervalMinutes).toBe(60);
      // The default location was not touched.
      expect(fake.locationModel.docs[0].startIntervalMinutes).toBe(30);
    });

    it('counts legacy bookings (no location) for the default location', async () => {
      const res = await http()
        .put('/api/admin/locations/principal/schedule')
        .set(auth)
        .send({ weekly: SCHEDULE.weekly })
        .expect(200);

      // Legacy booking + the explicit "principal" one, both on a closed Sunday.
      expect(res.body.affectedBookings).toBe(2);
    });

    it("counts nothing when the new schedule fits that location's bookings", async () => {
      await createCentro().expect(201);

      const res = await http()
        .put('/api/admin/locations/centro/schedule')
        .set(auth)
        .send({ weekly })
        .expect(200);

      expect(res.body.affectedBookings).toBe(0);
      expect(fake.locationModel.docs[1].weekly[0]).toEqual({
        closed: false,
        open: '09:00',
        close: '12:00',
      });
    });

    it('keeps the stored interval when startIntervalMinutes is absent', async () => {
      await createCentro().expect(201);
      await http()
        .put('/api/admin/locations/centro/schedule')
        .set(auth)
        .send({ weekly, startIntervalMinutes: 90 })
        .expect(200);

      const res = await http()
        .put('/api/admin/locations/centro/schedule')
        .set(auth)
        .send({ weekly })
        .expect(200);

      expect(res.body.schedule.startIntervalMinutes).toBe(90);
    });

    it('uses the same validations and messages as PUT /api/admin/schedule', async () => {
      const bad = await http()
        .put('/api/admin/locations/principal/schedule')
        .set(auth)
        .send({ weekly, startIntervalMinutes: 45 })
        .expect(400);
      expect(bad.body.message).toBe(
        'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.',
      );
      await http()
        .put('/api/admin/locations/principal/schedule')
        .set(auth)
        .send({})
        .expect(400);

      expect(fake.locationModel.docs[0].weekly).toEqual(SCHEDULE.weekly);
    });

    it('answers 404 for an unknown location', async () => {
      const res = await http()
        .put('/api/admin/locations/nope/schedule')
        .set(auth)
        .send({ weekly })
        .expect(404);

      expect(res.body.message).toBe('Location "nope" not found');
    });
  });

  describe('PUT /api/admin/schedule keeps acting on the default location', () => {
    it('saves into the oldest active location and counts its bookings', async () => {
      await createCentro().expect(201);

      const res = await http()
        .put('/api/admin/schedule')
        .set(auth)
        .send({ weekly: SCHEDULE.weekly, startIntervalMinutes: 120 })
        .expect(200);

      expect(res.body.schedule.startIntervalMinutes).toBe(120);
      expect(res.body.affectedBookings).toBe(2);
      expect(fake.locationModel.docs[0].startIntervalMinutes).toBe(120);
      expect(fake.locationModel.docs[1].startIntervalMinutes).toBe(30);
    });
  });

  describe('GET /api/admin/catalog and GET /api/catalog', () => {
    it('lists inactive locations for the admin and hides them from the public catalog', async () => {
      await createCentro().expect(201);
      await http()
        .put('/api/admin/locations/centro')
        .set(auth)
        .send({ name: 'Centro', address: 'Av. Central 123', active: false })
        .expect(200);

      const admin = await http()
        .get('/api/admin/catalog')
        .set(auth)
        .expect(200);
      const pub = await http().get('/api/catalog').expect(200);

      expect(admin.body.locations.map((l: any) => [l.id, l.active])).toEqual([
        ['principal', true],
        ['centro', false],
      ]);
      expect(pub.body.locations.map((l: any) => l.id)).toEqual(['principal']);
      expect(pub.body.locations[0]).toEqual({
        id: 'principal',
        name: 'Principal',
        address: '',
        schedule: {
          weekly: SCHEDULE.weekly,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 30,
        },
      });
      expect(pub.body.schedule).toEqual(pub.body.locations[0].schedule);
    });
  });

  describe('professional locations (S7)', () => {
    const create = (extra: object) =>
      http()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Zoe Díaz', ...extra });

    const MESSAGE = 'El profesional debe trabajar en al menos un local activo.';

    it('defaults to the default location on create', async () => {
      const res = await create({}).expect(201);

      expect(res.body.locations).toEqual(['principal']);
      expect(fake.professionalModel.docs[2].locationIds).toEqual(['principal']);
    });

    it('accepts existing active location ids on create and update', async () => {
      await createCentro().expect(201);

      const created = await create({
        locations: ['centro', 'principal'],
      }).expect(201);
      const updated = await http()
        .patch('/api/admin/professionals/zoe-diaz')
        .set(auth)
        .send({ locations: ['centro'] })
        .expect(200);

      expect(created.body.locations).toEqual(['centro', 'principal']);
      expect(updated.body.locations).toEqual(['centro']);
      expect(updated.body.name).toBe('Zoe Díaz');
    });

    it('a legacy professional reads as the default location in admin responses', async () => {
      const res = await http()
        .patch('/api/admin/professionals/alex-garcia')
        .set(auth)
        .send({ experience: '9 años' })
        .expect(200);

      expect(res.body.locations).toEqual(['principal']);
      expect(fake.professionalModel.docs[0].locationIds).toBeUndefined();
    });

    it.each([
      [[]],
      ['centro'],
      [['centro', 'centro']],
      [['nope']],
      [[3]],
      [['']],
    ])('rejects locations %j with the exact message', async (locations) => {
      await createCentro().expect(201);

      const res = await create({ locations }).expect(400);

      expect(res.body.message).toBe(MESSAGE);
      expect(fake.professionalModel.docs).toHaveLength(2);
    });

    it('rejects an inactive location on update and leaves the professional unchanged', async () => {
      await createCentro().expect(201);
      await http()
        .put('/api/admin/locations/centro')
        .set(auth)
        .send({ name: 'Centro', address: '', active: false })
        .expect(200);

      const res = await http()
        .patch('/api/admin/professionals/alex-garcia')
        .set(auth)
        .send({ locations: ['centro'] })
        .expect(400);

      expect(res.body.message).toBe(MESSAGE);
      expect(fake.professionalModel.docs[0].locationIds).toBeUndefined();
    });

    it('a PATCH with only `locations` is a valid edit; an empty body still is not', async () => {
      await http()
        .patch('/api/admin/professionals/alex-garcia')
        .set(auth)
        .send({ locations: ['principal'] })
        .expect(200);
      await http()
        .patch('/api/admin/professionals/alex-garcia')
        .set(auth)
        .send({})
        .expect(400);
    });
  });
});
