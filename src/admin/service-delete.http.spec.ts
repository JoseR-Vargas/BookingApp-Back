import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CatalogAdminService } from '../catalog/catalog-admin.service';
import { CatalogService } from '../catalog/catalog.service';
import { FakeModel, createFakeCatalog } from '../catalog/catalog.testing';
import { AdminController } from './admin.controller';
import { ScheduleImpactService, currentBusinessDate } from './schedule-impact';

const professional = (id: string, name: string) => ({
  id,
  name,
  specialty: 'Barber',
  experience: '1 año',
  rating: 5,
  avatar: 'fas fa-user',
  active: true,
  photo: null,
});

const service = (id: string, name: string, active = true) => ({
  id,
  name,
  description: 'd',
  price: 10,
  duration: 30,
  icon: 'fas fa-star',
  professionals: ['ana'],
  active,
});

const snapshot = (id: string, name: string) => ({
  id,
  name,
  price: 10,
  duration: 30,
});

const booking = (serviceIds: string[], date: string, status = 'confirmed') => ({
  professional: { id: 'ana', name: 'Ana' },
  services: serviceIds.map((id) => snapshot(id, id.toUpperCase())),
  date,
  time: '10:00',
  slots: ['10:00'],
  status,
});

const FUTURE = '2999-01-01';
const PAST = '2000-01-01';

/** Permanent service delete over HTTP with in-memory models. */
describe('DELETE /api/admin/services/:id/permanent', () => {
  const KEY = 'delete-test-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let saved: string | undefined;
  let professionals: FakeModel;
  let services: FakeModel;
  let bookings: FakeModel;

  const server = () => request(app.getHttpServer() as Server);
  const messageOf = (res: { body: unknown }) =>
    (res.body as { message: string }).message;

  async function setup(initial: {
    services?: ReturnType<typeof service>[];
    bookings?: ReturnType<typeof booking>[];
  }) {
    const fake = createFakeCatalog({
      professionals: [professional('ana', 'Ana')],
      services: initial.services ?? [service('corte', 'Corte')],
      bookings: initial.bookings ?? [],
    });
    professionals = fake.professionalModel;
    services = fake.serviceModel;
    bookings = fake.bookingModel;
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: CatalogService, useValue: {} },
        {
          provide: CatalogAdminService,
          useValue: new CatalogAdminService(
            fake.professionalModel,
            fake.serviceModel,
            fake.settingsModel,
            fake.bookingModel,
          ),
        },
        { provide: ScheduleImpactService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }

  beforeEach(() => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
  });

  afterEach(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  const del = (id = 'corte') =>
    server().delete(`/api/admin/services/${id}/permanent`);
  const ids = () => services.docs.map((doc) => doc.id as string);

  it('requires the admin key', async () => {
    await setup({});
    await del().expect(401);
    expect(ids()).toContain('corte');
  });

  it('answers 404 for an unknown service', async () => {
    await setup({});
    const res = await del('nobody').set(auth).expect(404);
    expect(messageOf(res)).toBe('Service "nobody" not found');
  });

  describe('future confirmed bookings', () => {
    it('blocks with the singular message for one booking', async () => {
      await setup({ bookings: [booking(['corte'], FUTURE)] });
      const res = await del().set(auth).expect(409);
      expect(messageOf(res)).toBe(
        'No se puede eliminar el servicio "Corte": tiene 1 reserva futura confirmada. Cancélalas o desactiva el servicio.',
      );
      expect(ids()).toContain('corte');
    });

    it('blocks with the plural message for several bookings', async () => {
      await setup({
        bookings: [
          booking(['corte'], FUTURE),
          booking(['corte'], '2999-01-02'),
          booking(['corte'], '2999-01-03'),
        ],
      });
      const res = await del().set(auth).expect(409);
      expect(messageOf(res)).toBe(
        'No se puede eliminar el servicio "Corte": tiene 3 reservas futuras confirmadas. Cancélalas o desactiva el servicio.',
      );
      expect(ids()).toContain('corte');
    });

    it("blocks on today's confirmed booking", async () => {
      await setup({ bookings: [booking(['corte'], currentBusinessDate())] });
      await del().set(auth).expect(409);
      expect(ids()).toContain('corte');
    });

    it('counts a booking with several services once', async () => {
      await setup({ bookings: [booking(['tinte', 'corte'], FUTURE)] });
      const res = await del().set(auth).expect(409);
      expect(messageOf(res)).toMatch(/tiene 1 reserva futura confirmada\./);
    });

    it('is not blocked by past, cancelled or other services bookings', async () => {
      await setup({
        bookings: [
          booking(['corte'], PAST),
          booking(['corte'], FUTURE, 'cancelled'),
          booking(['tinte'], FUTURE),
        ],
      });
      await del().set(auth).expect(200);
      expect(ids()).not.toContain('corte');
    });
  });

  it('deletes the document and leaves bookings and professionals untouched', async () => {
    const kept = [
      booking(['corte'], PAST),
      booking(['corte', 'tinte'], FUTURE, 'cancelled'),
      booking(['tinte'], FUTURE),
    ];
    await setup({
      services: [service('corte', 'Corte'), service('tinte', 'Tinte')],
      bookings: kept,
    });
    const before = structuredClone(professionals.docs);
    const res = await del().set(auth).expect(200);
    expect(res.body).toEqual({ id: 'corte', deleted: true });
    expect(ids()).toEqual(['tinte']);
    expect(bookings.docs).toEqual(kept);
    expect(professionals.docs).toEqual(before);
  });

  it('deletes an inactive service', async () => {
    await setup({ services: [service('corte', 'Corte', false)] });
    await del().set(auth).expect(200);
    expect(ids()).toEqual([]);
  });

  describe('id reuse', () => {
    const create = () =>
      server()
        .post('/api/admin/services')
        .set(auth)
        .send({
          name: 'Corte',
          description: 'd',
          price: 10,
          duration: 30,
          professionals: ['ana'],
        })
        .expect(201);

    it('does not reuse the id of a deleted service that has bookings', async () => {
      await setup({ bookings: [booking(['corte'], PAST)] });
      await del().set(auth).expect(200);
      const res = await create();
      expect((res.body as { id: string }).id).toBe('corte-2');
    });

    it('does not reuse the id when only a cancelled booking still references it', async () => {
      await setup({ bookings: [booking(['corte'], FUTURE, 'cancelled')] });
      await del().set(auth).expect(200);
      const res = await create();
      expect((res.body as { id: string }).id).toBe('corte-2');
    });

    it('may reuse the id of a deleted service without bookings', async () => {
      await setup({});
      await del().set(auth).expect(200);
      const res = await create();
      expect((res.body as { id: string }).id).toBe('corte');
    });
  });

  it('keeps the soft delete: DELETE /services/:id only deactivates', async () => {
    await setup({});
    const res = await server()
      .delete('/api/admin/services/corte')
      .set(auth)
      .expect(200);
    expect(res.body).toMatchObject({ id: 'corte', active: false });
    expect(ids()).toEqual(['corte']);
  });
});
