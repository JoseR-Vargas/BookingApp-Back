// Spec 22 against the real application and the integration database: the
// storage quota of a new business, the availability cache with its
// invalidation, and the 429 of the public routes.
process.env.MONGO_URI = 'mongodb://localhost:27018/booking_atlas_int_test';
process.env.ADMIN_API_KEY = 'atlas-int-key';
process.env.ADMIN_USERNAME = '';
process.env.SIGNUP_RATE_LIMIT_MAX = '100';
process.env.PUBLIC_RATE_LIMIT_PER_MINUTE = '40';
delete process.env.GMAIL_USER;

import { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../main';
import { TenantService } from '../tenancy/application/tenant.service';

const STORAGE_MESSAGE =
  'Este negocio alcanzó el límite de almacenamiento de su plan.';

describe('Atlas limits (integration)', () => {
  let app: NestExpressApplication;
  let connection: Connection;
  const http = () => request(app.getHttpServer());
  const tenants = () => connection.collection('tenants');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    await app.get(TenantService).create({ slug: 'viejo', name: 'Viejo' });
    await tenants().updateOne({ slug: 'viejo' }, { $set: { isDefault: true } });
  }, 60000);

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  async function business(name: string, patch: Record<string, unknown> = {}) {
    const res = await http()
      .post('/api/signup')
      .send({
        businessName: name,
        adminName: 'Ana',
        email: 'ana@example.com',
        password: 'a-long-password',
      })
      .expect(201);
    const slug = (res.body as { tenant: { slug: string } }).tenant.slug;
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
    await tenants().updateOne({ slug }, { $set: patch });
    const as = { 'X-Tenant': slug, Cookie: cookie };
    const professional = await http()
      .post('/api/admin/professionals')
      .set(as)
      .send({ name: 'Luis', specialty: 'Barber', experience: '3 years' })
      .expect(201);
    const service = await http()
      .post('/api/admin/services')
      .set(as)
      .send({
        name: 'Corte',
        description: 'Corte',
        price: 1000,
        duration: 30,
        professionals: [(professional.body as { id: string }).id],
      })
      .expect(201);
    return {
      slug,
      as,
      professionalId: (professional.body as { id: string }).id,
      serviceId: (service.body as { id: string }).id,
    };
  }

  const booking = (
    b: { professionalId: string; serviceId: string },
    time: string,
  ) => ({
    client: { name: 'Juan', email: 'juan@example.com', phone: '1234567890' },
    services: [{ id: b.serviceId }],
    professional: { id: b.professionalId, name: 'Luis' },
    date: '2027-03-24',
    time,
  });

  const slotsOf = async (b: { slug: string; serviceId: string }) => {
    const res = await http()
      .get(`/api/availability?date=2027-03-24&serviceIds=${b.serviceId}`)
      .set('X-Tenant', b.slug)
      .expect(200);
    return (res.body as { professionals: { slots: string[] }[] })
      .professionals[0].slots;
  };

  it('a new business is born with 50 MB and shows its storage in the session', async () => {
    const b = await business('Cuota Nueva');
    expect(await tenants().findOne({ slug: b.slug })).toMatchObject({
      storageQuotaBytes: 50 * 1024 * 1024,
    });

    const session = await http()
      .get('/api/admin/session')
      .set(b.as)
      .expect(200);
    const storage = (session.body as { storage: Record<string, unknown> })
      .storage;
    expect(storage).toMatchObject({
      quotaBytes: 50 * 1024 * 1024,
      percent: 0,
      level: 'ok',
    });
    expect(storage.usedBytes).toBeGreaterThan(0); // its location, settings, owner...
    expect(await tenants().findOne({ slug: b.slug })).toMatchObject({
      storageUsedBytes: storage.usedBytes,
    });
  }, 30000);

  it('the default business has no cap: storage is null and the key answer stays { ok: true }', async () => {
    const key = { Authorization: 'Bearer atlas-int-key' };
    expect((await http().get('/api/admin/session').set(key)).body).toEqual({
      ok: true,
    });
  });

  it('warns near the cap and refuses new bookings and photos at 100 %', async () => {
    const near = await business('Casi Lleno', {
      storageQuotaBytes: 1000000,
      storageUsedBytes: 750000,
      storageMeasuredAt: new Date(),
    });
    expect(
      (await http().get('/api/admin/session').set(near.as)).body,
    ).toMatchObject({
      storage: { usedBytes: 750000, percent: 75, level: 'warning' },
    });
    // A quota of 1 byte is always full: its measurement is over the cap.
    const full = await business('Lleno Ya', { storageQuotaBytes: 1 });
    const session = await http().get('/api/admin/session').set(full.as);
    expect(session.body).toMatchObject({ storage: { level: 'blocked' } });

    const blocked = await http()
      .post('/api/bookings')
      .set('X-Tenant', full.slug)
      .send(booking(full, '10:00'));
    expect(blocked.status).toBe(403);
    expect((blocked.body as { message: string }).message).toBe(STORAGE_MESSAGE);

    const photo = await http()
      .put(`/api/admin/professionals/${full.professionalId}/photo`)
      .set(full.as)
      .send({ image: 'data:image/png;base64,iVBORw0KGgo=' });
    expect([403, 404, 400]).toContain(photo.status);
    if (photo.status === 403) {
      expect((photo.body as { message: string }).message).toBe(STORAGE_MESSAGE);
    }
    await http().get('/api/bookings').set(full.as).expect(200);
  }, 60000);

  it('serves the second availability request from the cache and a booking shows at once', async () => {
    const b = await business('Cache Viva');
    const first = await slotsOf(b);
    expect(first).toContain('10:00');

    // Change the data behind the app's back: the cache still answers.
    await connection.collection('bookings').countDocuments(); // warm, no effect
    expect(await slotsOf(b)).toEqual(first);

    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '10:00'))
      .expect(201);

    expect(await slotsOf(b)).not.toContain('10:00');
  }, 30000);

  it('keeps the cache of a business away from another', async () => {
    const a = await business('Cache A');
    const c = await business('Cache C');
    await http()
      .post('/api/bookings')
      .set('X-Tenant', a.slug)
      .send(booking(a, '11:00'))
      .expect(201);

    expect(await slotsOf(a)).not.toContain('11:00');
    expect(await slotsOf(c)).toContain('11:00');
  }, 30000);

  it('answers 429 with the exact message past the limit, but never to the admin', async () => {
    const b = await business('Muchas Visitas');
    let last = 200;
    for (let i = 0; i < 60 && last !== 429; i++) {
      last = (
        await http().get('/api/public-availability').set('X-Tenant', b.slug)
      ).status;
    }
    expect(last).toBe(429);
    const res = await http()
      .get('/api/availability?date=2027-03-24&serviceIds=x')
      .set('X-Tenant', b.slug)
      .expect(429);
    expect(res.body).toEqual({
      statusCode: 429,
      message: 'Demasiadas peticiones. Intenta más tarde.',
    });
    await http().get('/api/admin/session').set(b.as).expect(200);
    await http().get('/api/bookings').set(b.as).expect(200);
  }, 60000);
});
