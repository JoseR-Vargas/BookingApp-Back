import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CatalogAdminService } from '../catalog/catalog-admin.service';
import { CatalogService } from '../catalog/catalog.service';
import { DomainErrorFilter } from '../shared/infrastructure/http/domain-error.filter';
import * as request from 'supertest';
import {
  FakeModel,
  createFakeCatalog,
  CATALOG_ROUTE_CONTROLLERS,
} from '../catalog/catalog.testing';
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

const service = (id: string, name: string, professionals: string[]) => ({
  id,
  name,
  description: 'd',
  price: 10,
  duration: 30,
  icon: 'fas fa-star',
  professionals,
  active: true,
});

const booking = (
  professionalId: string,
  date: string,
  status = 'confirmed',
) => ({
  professional: { id: professionalId, name: 'Ana' },
  date,
  time: '10:00',
  slots: ['10:00'],
  status,
});

const FUTURE = '2999-01-01';
const PAST = '2000-01-01';

/** Permanent delete over HTTP with in-memory models. */
describe('DELETE /api/admin/professionals/:id/permanent', () => {
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
      professionals: [
        {
          ...professional('ana', 'Ana'),
          photo: { mimeType: 'image/png', data: Buffer.from('x') },
        },
        professional('luis', 'Luis'),
      ],
      services: initial.services ?? [],
      bookings: initial.bookings ?? [],
    });
    professionals = fake.professionalModel;
    services = fake.serviceModel;
    bookings = fake.bookingModel;
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController, ...CATALOG_ROUTE_CONTROLLERS],
      providers: [
        ...fake.useCaseProviders,
        { provide: CatalogService, useValue: {} },
        { provide: CatalogAdminService, useValue: fake.admin },
        { provide: ScheduleImpactService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorFilter());
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

  const del = (id = 'ana') =>
    server().delete(`/api/admin/professionals/${id}/permanent`);
  const ids = () => professionals.docs.map((doc) => doc.id as string);

  it('requires the admin key', async () => {
    await setup({});
    await del().expect(401);
    expect(ids()).toContain('ana');
  });

  it('answers 404 for an unknown professional', async () => {
    await setup({});
    const res = await del('nobody').set(auth).expect(404);
    expect(messageOf(res)).toBe('Professional "nobody" not found');
  });

  it('treats an odd id as plain text: 404 and nothing is deleted', async () => {
    await setup({});
    const res = await del('%20x%24ne').set(auth).expect(404);
    expect(messageOf(res)).toBe('Professional " x$ne" not found');
    expect(ids()).toEqual(['ana', 'luis']);
  });

  describe('future confirmed bookings', () => {
    it('blocks with the singular message for one booking', async () => {
      await setup({ bookings: [booking('ana', FUTURE)] });
      const res = await del().set(auth).expect(409);
      expect(messageOf(res)).toBe(
        'No se puede eliminar a Ana: tiene 1 reserva futura confirmada. Cancélalas o desactiva al profesional.',
      );
      expect(ids()).toContain('ana');
    });

    it('blocks with the plural message for several bookings', async () => {
      await setup({
        bookings: [
          booking('ana', FUTURE),
          booking('ana', '2999-01-02'),
          booking('ana', '2999-01-03'),
        ],
      });
      const res = await del().set(auth).expect(409);
      expect(messageOf(res)).toBe(
        'No se puede eliminar a Ana: tiene 3 reservas futuras confirmadas. Cancélalas o desactiva al profesional.',
      );
      expect(ids()).toContain('ana');
    });

    it("blocks on today's confirmed booking", async () => {
      await setup({ bookings: [booking('ana', currentBusinessDate())] });
      await del().set(auth).expect(409);
      expect(ids()).toContain('ana');
    });

    it('is not blocked by past, cancelled or other professionals bookings', async () => {
      await setup({
        bookings: [
          booking('ana', PAST),
          booking('ana', FUTURE, 'cancelled'),
          booking('luis', FUTURE),
        ],
      });
      await del().set(auth).expect(200);
      expect(ids()).not.toContain('ana');
    });

    it('checks bookings before services', async () => {
      await setup({
        services: [service('corte', 'Corte', ['ana'])],
        bookings: [booking('ana', FUTURE)],
      });
      const res = await del().set(auth).expect(409);
      expect(messageOf(res)).toMatch(/reserva futura confirmada/);
    });
  });

  describe('sole-professional services', () => {
    it.each([true, false])(
      'blocks when a service (active: %s) is only offered by this professional',
      async (active) => {
        await setup({
          services: [
            service('mixto', 'Mixto', ['ana', 'luis']),
            { ...service('corte', 'Corte', ['ana']), active },
            service('tinte', 'Tinte', ['ana']),
          ],
        });
        const res = await del().set(auth).expect(409);
        expect(messageOf(res)).toBe(
          'No se puede eliminar a Ana: el servicio "Corte" solo lo ofrece este profesional. Asígnale otro profesional o desactiva el servicio.',
        );
        expect(ids()).toContain('ana');
        expect(services.docs[1].professionals).toEqual(['ana']);
      },
    );
  });

  it('deletes the document and photo, pulls the id from services and keeps bookings', async () => {
    const kept = [
      booking('ana', PAST),
      booking('ana', FUTURE, 'cancelled'),
      booking('luis', FUTURE),
    ];
    await setup({
      services: [
        service('mixto', 'Mixto', ['ana', 'luis']),
        service('solo-luis', 'Solo Luis', ['luis']),
      ],
      bookings: kept,
    });
    const res = await del().set(auth).expect(200);
    expect(res.body).toEqual({ id: 'ana', deleted: true });
    expect(ids()).toEqual(['luis']);
    expect(services.docs.map((doc) => doc.professionals as string[])).toEqual([
      ['luis'],
      ['luis'],
    ]);
    expect(bookings.docs).toEqual(kept);
  });

  describe('id reuse', () => {
    it('does not reuse the id of a deleted professional that has bookings', async () => {
      await setup({ bookings: [booking('ana', PAST)] });
      await del().set(auth).expect(200);
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Ana' })
        .expect(201);
      expect((res.body as { id: string }).id).toBe('ana-2');
    });

    it('does not reuse the id when only a cancelled booking still references it', async () => {
      await setup({ bookings: [booking('ana', FUTURE, 'cancelled')] });
      await del().set(auth).expect(200);
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Ana' })
        .expect(201);
      expect((res.body as { id: string }).id).toBe('ana-2');
    });

    it('may reuse the id of a deleted professional without bookings', async () => {
      await setup({});
      await del().set(auth).expect(200);
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Ana' })
        .expect(201);
      expect((res.body as { id: string }).id).toBe('ana');
    });
  });

  it('keeps the soft delete: DELETE /professionals/:id only deactivates', async () => {
    await setup({ services: [service('corte', 'Corte', ['ana'])] });
    const res = await server()
      .delete('/api/admin/professionals/ana')
      .set(auth)
      .expect(200);
    expect(res.body).toMatchObject({ id: 'ana', active: false });
    expect(ids()).toContain('ana');
    expect(services.docs[0].professionals).toEqual(['ana']);
  });
});
