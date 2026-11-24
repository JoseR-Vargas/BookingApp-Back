import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DomainErrorFilter } from '../../../shared/infrastructure/http/domain-error.filter';
import {
  fixedClock,
  inMemoryCatalog,
  inMemoryCatalogProviders,
} from '../in-memory-catalog.testing';
import { CatalogPhotoController } from './catalog-photo.controller';
import { ProfessionalPhotosAdminController } from './professional-photos-admin.controller';
import { ProfessionalsAdminController } from './professionals-admin.controller';
import { ServicesAdminController } from './services-admin.controller';
import { currentBusinessDate } from '../../../admin/schedule-impact';

const PHOTO_ERROR = 'La foto debe ser PNG, JPG o WebP de hasta 200 KB.';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 7),
]);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const NOW = new Date('2025-11-17T12:00:00.000Z');
const FUTURE = '2999-01-01';
const PAST = '2000-01-01';

interface Json {
  id?: string;
  message?: string;
  photoUrl?: string | null;
  [key: string]: unknown;
}
const bodyOf = (res: { body: unknown }) => res.body as Json;

/**
 * The professional, service and photo routes over HTTP with every port bound
 * to the in-memory adapters: guard, routing, status codes, messages. That the
 * whole suite passes without a database or a change to the use cases or the
 * domain IS the database-swap proof.
 */
describe('Catalog professional and service routes (swap proof: in-memory adapters bound)', () => {
  const KEY = 'catalog-http-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let kit: ReturnType<typeof inMemoryCatalog>;
  let saved: string | undefined;

  const server = () => request(app.getHttpServer() as Server);

  async function start(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        CatalogPhotoController,
        ProfessionalsAdminController,
        ProfessionalPhotosAdminController,
        ServicesAdminController,
      ],
      providers: inMemoryCatalogProviders(kit, fixedClock(NOW)),
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorFilter());
    app.setGlobalPrefix('api');
    await app.init();
  }

  beforeEach(async () => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    kit = inMemoryCatalog();
    kit.professionals.seed({
      id: 'alex-garcia',
      name: 'Alex García',
      specialty: 'Especialista',
      rating: 4.9,
    });
    kit.professionals.seed({ id: 'maria-lopez', name: 'María López' });
    kit.services.seed({
      id: 'servicio-basico',
      name: 'Servicio Básico',
      price: 1200,
      duration: 60,
      professionals: ['alex-garcia', 'maria-lopez'],
    });
    await start();
  });

  afterEach(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  const routes: [string, string][] = [
    ['post', '/api/admin/professionals'],
    ['patch', '/api/admin/professionals/alex-garcia'],
    ['delete', '/api/admin/professionals/alex-garcia'],
    ['delete', '/api/admin/professionals/alex-garcia/permanent'],
    ['put', '/api/admin/professionals/alex-garcia/photo'],
    ['delete', '/api/admin/professionals/alex-garcia/photo'],
    ['post', '/api/admin/services'],
    ['patch', '/api/admin/services/servicio-basico'],
    ['delete', '/api/admin/services/servicio-basico'],
    ['delete', '/api/admin/services/servicio-basico/permanent'],
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

  it('answers 401 everywhere when ADMIN_API_KEY is unset', async () => {
    delete process.env.ADMIN_API_KEY;
    await server()
      .post('/api/admin/professionals')
      .set('Authorization', 'Bearer ')
      .send({ name: 'Ana' })
      .expect(401);
    expect(kit.professionals.count).toBe(2);
  });

  describe('professionals', () => {
    it('creates (201) with a slug id, defaults and the default location', async () => {
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({
          name: 'Zoe Díaz',
          specialty: ' Stylist ',
          experience: '2 años',
          id: 'x',
          rating: 1,
        })
        .expect(201);
      expect(res.body).toEqual({
        id: 'zoe-diaz',
        name: 'Zoe Díaz',
        specialty: 'Stylist',
        experience: '2 años',
        rating: 5,
        avatar: 'fas fa-user',
        active: true,
        photoUrl: null,
        locations: ['principal'],
      });
    });

    it('suffixes -2, -3 for the same name and creates two at once without overwriting', async () => {
      const make = () =>
        server()
          .post('/api/admin/professionals')
          .set(auth)
          .send({ name: 'Ana' });
      const [a, b, c] = await Promise.all([make(), make(), make()]);
      expect([a, b, c].map((r) => bodyOf(r).id).sort()).toEqual([
        'ana',
        'ana-2',
        'ana-3',
      ]);
      expect(kit.professionals.count).toBe(5);
    });

    it.each([
      [null, 'name is required'],
      [[], 'body must be a JSON object'],
      [{}, 'name is required'],
      [{ name: '' }, 'name must be between 1 and 80 characters'],
      [{ name: 5 }, 'name must be a string'],
      [
        { name: 'A', specialty: 'x'.repeat(81) },
        'specialty must be at most 80 characters',
      ],
      [
        { name: 'A', experience: 'x'.repeat(41) },
        'experience must be at most 40 characters',
      ],
      [{ name: 'A', active: 'yes' }, 'active must be a boolean'],
      [
        { name: 'A', locations: [] },
        'El profesional debe trabajar en al menos un local activo.',
      ],
      [
        { name: 'A', locations: ['nowhere'] },
        'El profesional debe trabajar en al menos un local activo.',
      ],
      [{ name: 'A', photoDataUrl: 'nope' }, PHOTO_ERROR],
      [
        { name: '', photoDataUrl: 'nope' },
        'name must be between 1 and 80 characters',
      ],
    ])(
      'rejects the create body %j with 400 %s, creating nothing',
      async (body, message) => {
        const res = await server()
          .post('/api/admin/professionals')
          .set(auth)
          .send(body as object)
          .expect(400);
        expect(bodyOf(res).message).toBe(message);
        expect(kit.professionals.count).toBe(2);
      },
    );

    it('creates with its photo and serves it', async () => {
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Pho To', photoDataUrl: PNG_URL })
        .expect(201);
      expect(bodyOf(res).photoUrl).toBe(
        `/api/catalog/professionals/pho-to/photo?v=${NOW.getTime()}`,
      );
      const photo = await server()
        .get('/api/catalog/professionals/pho-to/photo')
        .expect(200);
      expect(photo.headers['content-type']).toBe('image/png');
      expect(Buffer.compare(photo.body as Buffer, PNG)).toBe(0);
    });

    it('patches only the editable fields, and 404/400 as before', async () => {
      const ok = await server()
        .patch('/api/admin/professionals/maria-lopez')
        .set(auth)
        .send({
          name: 'María L.',
          active: false,
          photo: 'x',
          photoDataUrl: PNG_URL,
        })
        .expect(200);
      expect(ok.body).toMatchObject({
        id: 'maria-lopez',
        name: 'María L.',
        active: false,
        photoUrl: null,
      });
      const missing = await server()
        .patch('/api/admin/professionals/nobody')
        .set(auth)
        .send({ name: 'x' })
        .expect(404);
      expect(bodyOf(missing).message).toBe('Professional "nobody" not found');
      const empty = await server()
        .patch('/api/admin/professionals/maria-lopez')
        .set(auth)
        .send({ rating: 2 })
        .expect(400);
      expect(bodyOf(empty).message).toBe(
        'body must include at least one editable field (name, specialty, experience, active)',
      );
      await server()
        .patch('/api/admin/professionals/maria-lopez')
        .set(auth)
        .send({ locations: ['zzz'] })
        .expect(400);
    });

    it('DELETE is a soft delete: the professional stays, inactive', async () => {
      const res = await server()
        .delete('/api/admin/professionals/alex-garcia')
        .set(auth)
        .expect(200);
      expect(res.body).toMatchObject({ id: 'alex-garcia', active: false });
      expect(kit.professionals.count).toBe(2);
      await server()
        .delete('/api/admin/professionals/nobody')
        .set(auth)
        .expect(404);
    });
  });

  describe('professional photos', () => {
    it('PUT stores a valid photo and GET serves it with type and cache headers, without a key', async () => {
      const put = await server()
        .put('/api/admin/professionals/maria-lopez/photo')
        .set(auth)
        .send({ dataUrl: PNG_URL })
        .expect(200);
      expect(bodyOf(put).photoUrl).toBe(
        `/api/catalog/professionals/maria-lopez/photo?v=${NOW.getTime()}`,
      );
      const get = await server()
        .get('/api/catalog/professionals/maria-lopez/photo')
        .expect(200);
      expect(get.headers['content-type']).toBe('image/png');
      expect(get.headers['cache-control']).toBe('public, max-age=86400');
      expect(get.headers['x-content-type-options']).toBe('nosniff');
    });

    it('serves the photo of an inactive professional', async () => {
      await server()
        .put('/api/admin/professionals/maria-lopez/photo')
        .set(auth)
        .send({ dataUrl: PNG_URL });
      await server()
        .delete('/api/admin/professionals/maria-lopez')
        .set(auth)
        .expect(200);
      await server()
        .get('/api/catalog/professionals/maria-lopez/photo')
        .expect(200);
    });

    it('GET answers 404 "Photo not found" without photo and for an unknown professional', async () => {
      for (const id of ['alex-garcia', 'nobody']) {
        const res = await server()
          .get(`/api/catalog/professionals/${id}/photo`)
          .expect(404);
        expect(bodyOf(res).message).toBe('Photo not found');
      }
    });

    it('PUT answers 400 for a bad body and 404 for an unknown professional', async () => {
      for (const body of [{}, { dataUrl: 'x' }]) {
        const res = await server()
          .put('/api/admin/professionals/maria-lopez/photo')
          .set(auth)
          .send(body)
          .expect(400);
        expect(bodyOf(res).message).toBe(PHOTO_ERROR);
      }
      const res = await server()
        .put('/api/admin/professionals/nobody/photo')
        .set(auth)
        .send({ dataUrl: PNG_URL })
        .expect(404);
      expect(bodyOf(res).message).toBe('Professional "nobody" not found');
    });

    it('DELETE removes the photo and leaves the professional active; 404 for an unknown one', async () => {
      await server()
        .put('/api/admin/professionals/maria-lopez/photo')
        .set(auth)
        .send({ dataUrl: PNG_URL });
      const res = await server()
        .delete('/api/admin/professionals/maria-lopez/photo')
        .set(auth)
        .expect(200);
      expect(res.body).toMatchObject({
        id: 'maria-lopez',
        active: true,
        photoUrl: null,
      });
      await server()
        .get('/api/catalog/professionals/maria-lopez/photo')
        .expect(404);
      await server()
        .delete('/api/admin/professionals/nobody/photo')
        .set(auth)
        .expect(404);
    });
  });

  describe('DELETE /professionals/:id/permanent', () => {
    const del = (id = 'alex-garcia') =>
      server().delete(`/api/admin/professionals/${id}/permanent`).set(auth);
    const booking = (
      professionalId: string,
      date: string,
      status: 'confirmed' | 'cancelled' = 'confirmed',
    ) => kit.activity.seed({ professionalId, serviceIds: ['x'], date, status });

    it('answers 404 for an unknown professional and treats an odd id as plain text', async () => {
      expect(bodyOf(await del('nobody').expect(404)).message).toBe(
        'Professional "nobody" not found',
      );
      expect(bodyOf(await del('%20x%24ne').expect(404)).message).toBe(
        'Professional " x$ne" not found',
      );
      expect(kit.professionals.count).toBe(2);
    });

    it('answers 409 with the singular and plural messages while it has upcoming bookings', async () => {
      booking('alex-garcia', FUTURE);
      expect(bodyOf(await del().expect(409)).message).toBe(
        'No se puede eliminar a Alex García: tiene 1 reserva futura confirmada. Cancélalas o desactiva al profesional.',
      );
      booking('alex-garcia', currentBusinessDate());
      expect(bodyOf(await del().expect(409)).message).toBe(
        'No se puede eliminar a Alex García: tiene 2 reservas futuras confirmadas. Cancélalas o desactiva al profesional.',
      );
      expect(kit.professionals.count).toBe(2);
    });

    it('answers 409 naming the first service only this professional offers', async () => {
      kit.services.seed({
        id: 'corte',
        name: 'Corte',
        professionals: ['alex-garcia'],
        active: false,
      });
      expect(bodyOf(await del().expect(409)).message).toBe(
        'No se puede eliminar a Alex García: el servicio "Corte" solo lo ofrece este profesional. Asígnale otro profesional o desactiva el servicio.',
      );
    });

    it('checks the bookings before the services', async () => {
      kit.services.seed({
        id: 'corte',
        name: 'Corte',
        professionals: ['alex-garcia'],
      });
      booking('alex-garcia', FUTURE);
      expect(bodyOf(await del().expect(409)).message).toMatch(
        /reserva futura confirmada/,
      );
    });

    it('deletes it, pulls the id from the services and is not blocked by past, cancelled or other bookings', async () => {
      booking('alex-garcia', PAST);
      booking('alex-garcia', FUTURE, 'cancelled');
      booking('maria-lopez', FUTURE);
      const res = await del().expect(200);
      expect(res.body).toEqual({ id: 'alex-garcia', deleted: true });
      expect((await kit.professionals.list('all')).map((p) => p.id)).toEqual([
        'maria-lopez',
      ]);
      expect(
        (await kit.services.find('servicio-basico'))?.professionals,
      ).toEqual(['maria-lopez']);
    });

    it('does not reuse the id of a deleted professional that has bookings, but reuses one without', async () => {
      kit.professionals.seed({ id: 'ana', name: 'Ana' });
      kit.professionals.seed({ id: 'luis', name: 'Luis' });
      booking('ana', PAST);
      await del('ana').expect(200);
      await del('luis').expect(200);
      const withBookings = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Ana' })
        .expect(201);
      const without = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Luis' })
        .expect(201);
      expect(bodyOf(withBookings).id).toBe('ana-2');
      expect(bodyOf(without).id).toBe('luis');
    });
  });

  describe('services', () => {
    const svc = {
      name: 'Corte Clásico',
      description: 'Corte',
      price: 1500,
      duration: 45,
      professionals: ['alex-garcia'],
    };

    it('creates (201) with a slug id, the default icon and deduplicated professionals', async () => {
      const res = await server()
        .post('/api/admin/services')
        .set(auth)
        .send({
          ...svc,
          professionals: ['alex-garcia', 'alex-garcia'],
          icon: 'x',
        })
        .expect(201);
      expect(res.body).toEqual({
        id: 'corte-clasico',
        ...svc,
        icon: 'fas fa-star',
        active: true,
      });
      const second = await server()
        .post('/api/admin/services')
        .set(auth)
        .send(svc)
        .expect(201);
      expect(bodyOf(second).id).toBe('corte-clasico-2');
    });

    it.each([
      [null, 'name is required'],
      [{ ...svc, price: undefined }, 'price is required'],
      [{ ...svc, price: -1 }, 'price must be an integer >= 0'],
      [{ ...svc, price: 1.5 }, 'price must be an integer >= 0'],
      [
        { ...svc, duration: 4 },
        'duration must be an integer between 5 and 480',
      ],
      [
        { ...svc, duration: 481 },
        'duration must be an integer between 5 and 480',
      ],
      [
        { ...svc, professionals: [] },
        'professionals must be a non-empty array of professional ids',
      ],
      [
        { ...svc, professionals: [''] },
        'professionals must contain only ids (non-empty strings)',
      ],
      [
        { ...svc, professionals: ['alex-garcia', 'ghost', 'phantom'] },
        'professionals not found: ghost, phantom',
      ],
      [
        { ...svc, name: '', professionals: ['ghost'] },
        'name must be between 1 and 80 characters',
      ],
    ])(
      'rejects the create body %j with 400 %s, creating nothing',
      async (body, message) => {
        const res = await server()
          .post('/api/admin/services')
          .set(auth)
          .send(body as object)
          .expect(400);
        expect(bodyOf(res).message).toBe(message);
        expect(kit.services.count).toBe(1);
      },
    );

    it('patches the editable fields, toggles active, and answers 404/400 as before', async () => {
      const ok = await server()
        .patch('/api/admin/services/servicio-basico')
        .set(auth)
        .send({
          price: 1300,
          duration: 75,
          professionals: ['maria-lopez'],
          icon: 'zz',
        })
        .expect(200);
      expect(ok.body).toMatchObject({
        price: 1300,
        duration: 75,
        professionals: ['maria-lopez'],
        icon: 'fas fa-star',
      });
      const off = await server()
        .patch('/api/admin/services/servicio-basico')
        .set(auth)
        .send({ active: false })
        .expect(200);
      expect(bodyOf(off).active).toBe(false);
      const missing = await server()
        .patch('/api/admin/services/nope')
        .set(auth)
        .send({ price: 1 })
        .expect(404);
      expect(bodyOf(missing).message).toBe('Service "nope" not found');
      const ghost = await server()
        .patch('/api/admin/services/servicio-basico')
        .set(auth)
        .send({ professionals: ['ghost'] })
        .expect(400);
      expect(bodyOf(ghost).message).toBe('professionals not found: ghost');
      await server()
        .patch('/api/admin/services/servicio-basico')
        .set(auth)
        .send({})
        .expect(400);
    });

    it('DELETE is a soft delete: the service stays, inactive', async () => {
      const res = await server()
        .delete('/api/admin/services/servicio-basico')
        .set(auth)
        .expect(200);
      expect(res.body).toMatchObject({ id: 'servicio-basico', active: false });
      expect(kit.services.count).toBe(1);
      await server().delete('/api/admin/services/nope').set(auth).expect(404);
    });

    describe('DELETE /services/:id/permanent', () => {
      const del = (id = 'servicio-basico') =>
        server().delete(`/api/admin/services/${id}/permanent`).set(auth);
      const booking = (
        serviceIds: string[],
        date: string,
        status: 'confirmed' | 'cancelled' = 'confirmed',
      ) =>
        kit.activity.seed({ professionalId: 'zzz', serviceIds, date, status });

      it('answers 404 for an unknown service', async () => {
        expect(bodyOf(await del('nope').expect(404)).message).toBe(
          'Service "nope" not found',
        );
      });

      it('answers 409 with the singular and plural messages, counting a booking with several services once', async () => {
        booking(['servicio-basico', 'servicio-basico'], FUTURE);
        expect(bodyOf(await del().expect(409)).message).toBe(
          'No se puede eliminar el servicio "Servicio Básico": tiene 1 reserva futura confirmada. Cancélalas o desactiva el servicio.',
        );
        booking(['x', 'servicio-basico'], currentBusinessDate());
        expect(bodyOf(await del().expect(409)).message).toBe(
          'No se puede eliminar el servicio "Servicio Básico": tiene 2 reservas futuras confirmadas. Cancélalas o desactiva el servicio.',
        );
        expect(kit.services.count).toBe(1);
      });

      it('deletes it, leaving the professionals untouched, when only past, cancelled or other bookings exist', async () => {
        booking(['servicio-basico'], PAST);
        booking(['servicio-basico'], FUTURE, 'cancelled');
        booking(['otro'], FUTURE);
        const res = await del().expect(200);
        expect(res.body).toEqual({ id: 'servicio-basico', deleted: true });
        expect(kit.services.count).toBe(0);
        expect(kit.professionals.count).toBe(2);
      });

      it('does not reuse the id of a deleted service that has bookings', async () => {
        booking(['servicio-basico'], PAST);
        await del().expect(200);
        const res = await server()
          .post('/api/admin/services')
          .set(auth)
          .send({ ...svc, name: 'Servicio Básico' })
          .expect(201);
        expect(bodyOf(res).id).toBe('servicio-basico-2');
      });
    });
  });

  describe('a database failure', () => {
    it('answers 500, not 400 or 409, when a repository throws', async () => {
      jest
        .spyOn(kit.professionals, 'update')
        .mockRejectedValue(new Error('connection lost'));
      jest
        .spyOn(kit.services, 'insert')
        .mockRejectedValue(new Error('connection lost'));
      jest
        .spyOn(kit.professionals, 'findPhoto')
        .mockRejectedValue(new Error('connection lost'));
      jest
        .spyOn(kit.activity, 'countUpcomingConfirmed')
        .mockRejectedValue(new Error('connection lost'));
      await server()
        .patch('/api/admin/professionals/alex-garcia')
        .set(auth)
        .send({ name: 'x' })
        .expect(500);
      await server()
        .post('/api/admin/services')
        .set(auth)
        .send({
          name: 'S',
          price: 1,
          duration: 5,
          professionals: ['alex-garcia'],
        })
        .expect(500);
      await server()
        .get('/api/catalog/professionals/alex-garcia/photo')
        .expect(500);
      await server()
        .delete('/api/admin/professionals/alex-garcia/permanent')
        .set(auth)
        .expect(500);
    });
  });
});
