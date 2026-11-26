import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CountAffectedBookingsUseCase } from '../../../admin/application/use-cases/count-affected-bookings.use-case';
import { MongoUpcomingBookingsReader } from '../../../admin/infrastructure/mongo-upcoming-bookings.reader';
import { ScheduleImpactService } from '../../../admin/schedule-impact';
import { DomainErrorFilter } from '../../../shared/infrastructure/http/domain-error.filter';
import { SEED_SCHEDULE } from '../../domain/seed-schedule';
import {
  fixedClock,
  inMemoryCatalog,
  inMemoryCatalogProviders,
} from '../in-memory-catalog.testing';
import { LocationsAdminController } from './locations-admin.controller';
import { PublicAvailabilityAdminController } from './public-availability-admin.controller';
import { ScheduleAdminController } from './schedule-admin.controller';

const NOW = new Date('2025-11-17T12:00:00.000Z');
const LAST_ACTIVE = 'Debe quedar al menos un local activo.';

interface Json {
  id?: string;
  message?: string;
  [key: string]: unknown;
}
const bodyOf = (res: { body: unknown }) => res.body as Json;

const week = (over: Record<number, unknown> = {}) => ({
  ...SEED_SCHEDULE.weekly,
  1: { closed: false, open: '10:00', close: '18:00' },
  6: { closed: true },
  ...over,
});

/** The bookings the schedule impact sees; a 2999 Sunday is closed in the seed schedule. */
const BOOKINGS = [
  { date: '2999-01-06', time: '10:00', slots: ['10:00'] },
  {
    date: '2999-01-06',
    time: '10:00',
    slots: ['10:00'],
    location: { id: 'principal' },
  },
  {
    date: '2999-01-06',
    time: '10:00',
    slots: ['10:00'],
    location: { id: 'centro' },
  },
  {
    date: '2999-01-06',
    time: '10:00',
    slots: ['10:00'],
    location: { id: 'centro' },
  },
];
const bookingModel = {
  find: () => ({ lean: () => ({ exec: () => Promise.resolve(BOOKINGS) }) }),
};

/**
 * The location, schedule and public availability routes over HTTP with every
 * port bound to the in-memory adapters: guard, routing, status codes,
 * messages. That the whole suite passes without a database or a change to the
 * use cases or the domain IS the database-swap proof.
 */
describe('Location, schedule and public availability routes (swap proof: in-memory adapters bound)', () => {
  const KEY = 'locations-http-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let kit: ReturnType<typeof inMemoryCatalog>;
  let saved: string | undefined;

  const server = () => request(app.getHttpServer() as Server);
  const ids = async () => (await kit.locations.list()).map((l) => l.id);

  async function start(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        LocationsAdminController,
        ScheduleAdminController,
        PublicAvailabilityAdminController,
      ],
      providers: [
        ...inMemoryCatalogProviders(kit, fixedClock(NOW)),
        {
          provide: ScheduleImpactService,
          useValue: new ScheduleImpactService(
            new CountAffectedBookingsUseCase(
              new MongoUpcomingBookingsReader(bookingModel as never),
            ),
          ),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorFilter());
    app.setGlobalPrefix('api');
    await app.init();
  }

  beforeEach(async () => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    kit = inMemoryCatalog(fixedClock(NOW));
    kit.locations.seed({ id: 'principal', createdAt: new Date(1_000) });
    kit.services.seed({ id: 'servicio-basico' });
    await start();
  });

  afterEach(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  const createCentro = () =>
    server()
      .post('/api/admin/locations')
      .set(auth)
      .send({ name: 'Centro', address: 'Av. Central 123' });

  const routes: [string, string][] = [
    ['post', '/api/admin/locations'],
    ['put', '/api/admin/locations/principal'],
    ['put', '/api/admin/locations/principal/schedule'],
    ['put', '/api/admin/schedule'],
    ['put', '/api/admin/public-availability'],
  ];

  it.each(routes)('%s %s answers 401 without a key', async (method, path) => {
    const res = await (server() as any)[method](path);
    expect(res.status).toBe(401);
    expect(bodyOf(res).message).toBe('Invalid or missing admin key');
  });

  it.each(routes)(
    '%s %s answers 401 with a wrong key',
    async (method, path) => {
      await (server() as any)
        [method](path)
        .set('Authorization', 'Bearer nope')
        .expect(401);
    },
  );

  describe('POST /api/admin/locations', () => {
    it('creates a location (201) with the seed schedule and a slug id', async () => {
      const res = await createCentro().expect(201);

      expect(res.body).toEqual({
        id: 'centro',
        name: 'Centro',
        address: 'Av. Central 123',
        active: true,
        schedule: {
          weekly: SEED_SCHEDULE.weekly,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 30,
        },
      });
      expect(await ids()).toEqual(['principal', 'centro']);
    });

    it('defaults the address, trims the name and numbers a repeated one', async () => {
      const first = await server()
        .post('/api/admin/locations')
        .set(auth)
        .send({ name: '  Sur  ' })
        .expect(201);
      expect(first.body).toMatchObject({ id: 'sur', name: 'Sur', address: '' });
      const second = await server()
        .post('/api/admin/locations')
        .set(auth)
        .send({ name: 'Sur' })
        .expect(201);
      expect(bodyOf(second).id).toBe('sur-2');
    });

    it.each([
      [{}, 'El nombre del local es obligatorio (máximo 80 caracteres).'],
      [
        { name: 'x'.repeat(81) },
        'El nombre del local es obligatorio (máximo 80 caracteres).',
      ],
      [
        { name: 'Norte', address: 'x'.repeat(201) },
        'La dirección del local no puede superar los 200 caracteres.',
      ],
      [[], 'body must be a JSON object'],
    ])('answers 400 for %j and stores nothing', async (body, message) => {
      const res = await server()
        .post('/api/admin/locations')
        .set(auth)
        .send(body as object)
        .expect(400);
      expect(bodyOf(res).message).toBe(message);
      expect(await ids()).toEqual(['principal']);
    });
  });

  describe('PUT /api/admin/locations/:id', () => {
    it('edits the given fields (200)', async () => {
      const res = await server()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ name: 'Casa central', address: ' Calle 1 ' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: 'principal',
        name: 'Casa central',
        address: 'Calle 1',
        active: true,
      });
    });

    it('answers 404 for an unknown id and 400 before it for an empty body', async () => {
      const missing = await server()
        .put('/api/admin/locations/nope')
        .set(auth)
        .send({ name: 'X' })
        .expect(404);
      expect(bodyOf(missing).message).toBe('Location "nope" not found');
      const empty = await server()
        .put('/api/admin/locations/nope')
        .set(auth)
        .send({})
        .expect(400);
      expect(bodyOf(empty).message).toBe(
        'body must include at least one editable field (name, address, active)',
      );
    });

    it('answers 400 for a non-boolean active', async () => {
      const res = await server()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ active: 'no' })
        .expect(400);
      expect(bodyOf(res).message).toBe(
        'El estado del local debe ser verdadero o falso.',
      );
    });

    it('cannot deactivate the last active location', async () => {
      const res = await server()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ active: false })
        .expect(400);
      expect(bodyOf(res).message).toBe(LAST_ACTIVE);
      expect((await kit.locations.list())[0].active).toBe(true);
    });

    it('can deactivate one while another stays active, not the remaining one, and can reactivate', async () => {
      await createCentro().expect(201);
      await server()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ active: false })
        .expect(200);
      const refused = await server()
        .put('/api/admin/locations/centro')
        .set(auth)
        .send({ active: false })
        .expect(400);
      expect(bodyOf(refused).message).toBe(LAST_ACTIVE);
      await server()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ active: true })
        .expect(200);
    });
  });

  describe('PUT /api/admin/schedule', () => {
    it('saves the week on the default location and counts the affected bookings', async () => {
      const res = await server()
        .put('/api/admin/schedule')
        .set(auth)
        .send({ weekly: week() })
        .expect(200);

      expect(res.body).toEqual({
        schedule: {
          weekly: week(),
          slotIntervalMinutes: 30,
          startIntervalMinutes: 30,
        },
        // The booking without location counts for the default one, with the principal one.
        affectedBookings: 2,
      });
    });

    it('acts on the oldest ACTIVE location, not on the first one', async () => {
      await createCentro().expect(201);
      await server()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ active: false })
        .expect(200);

      await server()
        .put('/api/admin/schedule')
        .set(auth)
        .send({ weekly: week() })
        .expect(200);

      const [principal, centro] = await kit.locations.list();
      expect(principal.weekly).toEqual(SEED_SCHEDULE.weekly);
      expect(centro.weekly).toEqual(week());
    });

    it('stores a new start interval and keeps it when omitted', async () => {
      await server()
        .put('/api/admin/schedule')
        .set(auth)
        .send({ weekly: week(), startIntervalMinutes: 180 })
        .expect(200);
      const res = await server()
        .put('/api/admin/schedule')
        .set(auth)
        .send({ weekly: week() })
        .expect(200);
      expect(bodyOf(res).schedule).toMatchObject({ startIntervalMinutes: 180 });
    });

    it('migrates a store that was never migrated before saving', async () => {
      kit = inMemoryCatalog(fixedClock(NOW));
      await app.close();
      await start();

      await server()
        .put('/api/admin/schedule')
        .set(auth)
        .send({ weekly: week() })
        .expect(200);

      expect(await ids()).toEqual(['principal']);
      expect((await kit.locations.list())[0].weekly).toEqual(week());
    });

    it.each([
      [{}, 'weekly is required'],
      [{ weekly: week({ 2: undefined }) }, 'day 2 is required'],
      [
        {
          weekly: week({ 2: { closed: false, open: '18:00', close: '09:00' } }),
        },
        'day 2: open must be earlier than close',
      ],
      [
        { weekly: week(), startIntervalMinutes: 45 },
        'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.',
      ],
    ])('answers 400 for %j and stores nothing', async (body, message) => {
      const res = await server()
        .put('/api/admin/schedule')
        .set(auth)
        .send(body)
        .expect(400);
      expect(bodyOf(res).message).toBe(message);
      expect((await kit.locations.list())[0].weekly).toEqual(
        SEED_SCHEDULE.weekly,
      );
    });
  });

  describe('PUT /api/admin/locations/:id/schedule', () => {
    it('saves that location only and counts only its bookings', async () => {
      await createCentro().expect(201);

      const res = await server()
        .put('/api/admin/locations/centro/schedule')
        .set(auth)
        .send({ weekly: week(), startIntervalMinutes: 60 })
        .expect(200);

      expect(res.body).toEqual({
        schedule: {
          weekly: week(),
          slotIntervalMinutes: 30,
          startIntervalMinutes: 60,
        },
        affectedBookings: 2,
      });
      expect((await kit.locations.list())[0].weekly).toEqual(
        SEED_SCHEDULE.weekly,
      );
    });

    it('answers 404 for an unknown location and 400 for an invalid body', async () => {
      const missing = await server()
        .put('/api/admin/locations/nope/schedule')
        .set(auth)
        .send({ weekly: week() })
        .expect(404);
      expect(bodyOf(missing).message).toBe('Location "nope" not found');
      await server()
        .put('/api/admin/locations/principal/schedule')
        .set(auth)
        .send({})
        .expect(400);
    });
  });

  describe('PUT /api/admin/public-availability', () => {
    it('stores the settings and answers them (200)', async () => {
      const settings = {
        enabled: true,
        days: 10,
        serviceIds: ['servicio-basico'],
      };
      const res = await server()
        .put('/api/admin/public-availability')
        .set(auth)
        .send(settings)
        .expect(200);
      expect(res.body).toEqual({ publicAvailability: settings });
      expect(kit.settings.stored()?.publicAvailability).toEqual(settings);
    });

    it('accepts null (every service)', async () => {
      await server()
        .put('/api/admin/public-availability')
        .set(auth)
        .send({ enabled: false, days: 7, serviceIds: null })
        .expect(200);
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
        { enabled: true, days: 7, serviceIds: ['servicio-basico', 'nope'] },
        'Alguno de los servicios publicados no existe.',
      ],
    ])('answers 400 for %j and stores nothing', async (body, message) => {
      const res = await server()
        .put('/api/admin/public-availability')
        .set(auth)
        .send(body)
        .expect(400);
      expect(bodyOf(res).message).toBe(message);
      expect(kit.settings.stored()).toBeNull();
    });
  });

  describe('when the store fails', () => {
    it('answers 500 (an infrastructure failure is not a business error)', async () => {
      jest
        .spyOn(kit.locations, 'list')
        .mockRejectedValue(new Error('database down'));

      const res = await server()
        .put('/api/admin/locations/principal')
        .set(auth)
        .send({ name: 'X' })
        .expect(500);
      expect(res.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    });
  });
});
