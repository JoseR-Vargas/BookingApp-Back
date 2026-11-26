// The signup against the real application and the integration database
// (spec 21): the business it creates, the trial, the block of new bookings and
// the compensation of a signup that fails halfway.
process.env.MONGO_URI = 'mongodb://localhost:27018/booking_signup_int_test';
process.env.ADMIN_API_KEY = 'signup-int-key';
process.env.ADMIN_USERNAME = '';
process.env.SIGNUP_RATE_LIMIT_MAX = '100';
delete process.env.GMAIL_USER; // the welcome mail is only a warning

import { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../main';
import { CatalogSeeder } from '../catalog/infrastructure/persistence/mongo/catalog.seeder';
import {
  TENANT_SCOPE,
  TenantScope,
} from '../shared/application/tenant-context.port';
import {
  TENANT_ERASER,
  TenantEraser,
} from '../tenancy/application/ports/tenant-eraser.port';
import { TenantService } from '../tenancy/application/tenant.service';
import { SCOPED_COLLECTIONS } from '../tenancy/infrastructure/migration/tenant-migration';

const KEY = { Authorization: 'Bearer signup-int-key' };
const PASSWORD = 'a-long-password';
const LIMIT_MESSAGE = 'Este negocio alcanzó el límite de su prueba.';

const signupBody = (over: Record<string, unknown> = {}) => ({
  businessName: 'Barbería Sur',
  adminName: 'Ana',
  email: 'ana@example.com',
  password: PASSWORD,
  ...over,
});

describe('Business signup (integration)', () => {
  let app: NestExpressApplication;
  let connection: Connection;

  const http = () => request(app.getHttpServer());
  const tenants = () => connection.collection('tenants');
  const countOf = (collection: string, tenantId: string) =>
    connection
      .collection(collection)
      .countDocuments({ tenantId: new Types.ObjectId(tenantId) });

  /** Signs up and answers what the next requests need: the slug, the cookie and the id. */
  async function signUp(over: Record<string, unknown> = {}) {
    const res = await http().post('/api/signup').send(signupBody(over));
    expect(res.status).toBe(201);
    const body = res.body as { tenant: { slug: string } };
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
    const record = await tenants().findOne({ slug: body.tenant.slug });
    return {
      slug: body.tenant.slug,
      cookie,
      id: String(record!._id),
      body: res.body as Record<string, unknown>,
    };
  }

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
    // The startup migration ran on the empty database: build the default business.
    await app.get(TenantService).create({ slug: 'sur-viejo', name: 'Viejo' });
    await tenants().updateOne(
      { slug: 'sur-viejo' },
      { $set: { isDefault: true } },
    );
  }, 60000);

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  it('creates the business with no header, with its base, its owner and its session', async () => {
    const created = await signUp();

    expect(created.slug).toBe('barberia-sur');
    expect(created.body).toMatchObject({
      ok: true,
      tenant: { slug: 'barberia-sur', name: 'Barbería Sur' },
      user: { email: 'ana@example.com', role: 'owner' },
    });
    const record = await tenants().findOne({ slug: 'barberia-sur' });
    expect(record).toMatchObject({
      status: 'active',
      isDefault: false,
      bookingQuota: 20,
    });
    const days =
      ((record!.trialEndsAt as Date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);

    // The base: the "Principal" location and the schedule, nothing else.
    expect(await countOf('locations', created.id)).toBe(1);
    expect(await countOf('business_settings', created.id)).toBe(1);
    expect(await countOf('professionals', created.id)).toBe(0);
    expect(await countOf('services', created.id)).toBe(0);
    expect(await countOf('admin_users', created.id)).toBe(1);
    expect(await countOf('admin_sessions', created.id)).toBe(1);

    const catalog = await http()
      .get('/api/catalog')
      .set('X-Tenant', created.slug)
      .expect(200);
    expect(catalog.body).toMatchObject({ professionals: [], services: [] });
    await http()
      .get('/api/public-availability')
      .set('X-Tenant', created.slug)
      .expect((res) => expect(JSON.stringify(res.body)).toContain('false'));
  });

  it('opens an admin session of the new business and shows the trial in it', async () => {
    const created = await signUp({ businessName: 'Con Prueba' });

    const session = await http()
      .get('/api/admin/session')
      .set('X-Tenant', created.slug)
      .set('Cookie', created.cookie)
      .expect(200);
    expect(session.body).toMatchObject({
      ok: true,
      user: { email: 'ana@example.com', role: 'owner' },
      trial: {
        daysLeft: 14,
        bookingsMade: 0,
        bookingQuota: 20,
        blocked: false,
      },
    });
    // The cookie of one business means nothing in another.
    await http()
      .get('/api/admin/session')
      .set('X-Tenant', 'sur-viejo')
      .set('Cookie', created.cookie)
      .expect(401);
    // The legacy key answer is exactly what it always was.
    const keyed = await http()
      .get('/api/admin/session')
      .set('X-Tenant', 'sur-viejo')
      .set(KEY)
      .expect(200);
    expect(keyed.body).toEqual({ ok: true });
  });

  it('a business without a trial (the default one) has trial: null in an account session', async () => {
    const scope = app.get<TenantScope>(TENANT_SCOPE);
    const old = await tenants().findOne({ slug: 'sur-viejo' });
    await scope.run({ id: String(old!._id), slug: 'sur-viejo' }, async () => {
      await app.get(CatalogSeeder).seedBase();
    });
    // An owner of the old business: use the signup's own use case via the HTTP key route.
    await http()
      .post('/api/admin/users')
      .set('X-Tenant', 'sur-viejo')
      .set(KEY)
      .send({
        email: 'dueno@example.com',
        name: 'Dueño',
        password: PASSWORD,
        role: 'owner',
      })
      .expect(201);
    const login = await http()
      .post('/api/admin/session')
      .set('X-Tenant', 'sur-viejo')
      .send({ email: 'dueno@example.com', password: PASSWORD })
      .expect(200);
    const cookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    const session = await http()
      .get('/api/admin/session')
      .set('X-Tenant', 'sur-viejo')
      .set('Cookie', cookie)
      .expect(200);
    expect((session.body as { trial: unknown }).trial).toBeNull();
  });

  it('rejects a repeated, an invalid and a reserved slug and creates nothing', async () => {
    const before = await tenants().countDocuments();
    const repeated = await http()
      .post('/api/signup')
      .send(signupBody({ slug: 'barberia-sur' }));
    expect(repeated.status).toBe(409);
    expect((repeated.body as { message: string }).message).toBe(
      'El slug "barberia-sur" ya está en uso.',
    );
    await http()
      .post('/api/signup')
      .send(signupBody({ slug: 'a' }))
      .expect(400);
    await http()
      .post('/api/signup')
      .send(signupBody({ slug: 'admin' }))
      .expect(400);
    await http()
      .post('/api/signup')
      .send(signupBody({ email: 'nope' }))
      .expect(400);
    await http()
      .post('/api/signup')
      .send(signupBody({ password: 'short' }))
      .expect(400);
    expect(await tenants().countDocuments()).toBe(before);
  });

  it('works while the default business is suspended', async () => {
    await tenants().updateOne(
      { isDefault: true },
      { $set: { status: 'suspended' } },
    );
    try {
      // The default business answers 403 now ...
      await http().get('/api/catalog').expect(403);
      // ... and the signup does not care.
      await signUp({ businessName: 'Con Default Suspendido' });
    } finally {
      await tenants().updateOne(
        { isDefault: true },
        { $set: { status: 'active' } },
      );
    }
  });

  it('keeps two signed-up businesses apart', async () => {
    const a = await signUp({
      businessName: 'Aislado Uno',
      email: 'a@example.com',
    });
    const b = await signUp({
      businessName: 'Aislado Dos',
      email: 'a@example.com',
    });

    expect(a.id).not.toBe(b.id);
    const users = (slug: string, cookie: string) =>
      http()
        .get('/api/admin/users')
        .set('X-Tenant', slug)
        .set('Cookie', cookie);
    const listA = (await users(a.slug, a.cookie).expect(200)).body as {
      email: string;
    }[];
    const listB = (await users(b.slug, b.cookie).expect(200)).body as {
      email: string;
    }[];
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(await countOf('locations', a.id)).toBe(1);
    expect(await countOf('locations', b.id)).toBe(1);
  });

  describe('the limit of the trial', () => {
    /**
     * A business with one professional and one service. `patch` changes its
     * trial right after the signup: the tenancy keeps a business for a minute
     * once it resolves it, so the change must come before the first request.
     */
    async function businessWithCatalog(
      name: string,
      patch: Record<string, unknown> = {},
    ) {
      const created = await signUp({
        businessName: name,
        email: 'cat@example.com',
      });
      await tenants().updateOne({ slug: created.slug }, { $set: patch });
      const as = { 'X-Tenant': created.slug, Cookie: created.cookie };
      const professional = await http()
        .post('/api/admin/professionals')
        .set(as)
        .send({
          name: 'Luis Peluquero',
          specialty: 'Barber',
          experience: '3 years',
        })
        .expect(201);
      const service = await http()
        .post('/api/admin/services')
        .set(as)
        .send({
          name: 'Corte',
          description: 'Corte clásico',
          price: 1000,
          duration: 30,
          professionals: [(professional.body as { id: string }).id],
        })
        .expect(201);
      return {
        ...created,
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
      professional: { id: b.professionalId, name: 'Luis Peluquero' },
      date: '2027-03-24',
      time,
    });

    it('accepts bookings until the quota, then answers 403 and keeps the panel and the catalog working', async () => {
      const b = await businessWithCatalog('Cupo Dos', { bookingQuota: 2 });
      const first = await http()
        .post('/api/bookings')
        .set('X-Tenant', b.slug)
        .send(booking(b, '10:00'));
      expect(first.status).toBe(201);
      await http()
        .post('/api/bookings')
        .set('X-Tenant', b.slug)
        .send(booking(b, '11:00'))
        .expect(201);

      const blocked = await http()
        .post('/api/bookings')
        .set('X-Tenant', b.slug)
        .send(booking(b, '12:00'));
      expect(blocked.status).toBe(403);
      expect((blocked.body as { message: string }).message).toBe(LIMIT_MESSAGE);
      expect(await countOf('bookings', b.id)).toBe(2);

      // Admin, catalog, availability reads and cancellation keep working.
      const session = await http()
        .get('/api/admin/session')
        .set(b.as)
        .expect(200);
      expect(session.body).toMatchObject({
        trial: { bookingsMade: 2, bookingQuota: 2, blocked: true },
      });
      await http().get('/api/catalog').set('X-Tenant', b.slug).expect(200);
      await http().get('/api/bookings').set(b.as).expect(200);
      const token = (first.body as { cancelToken: string }).cancelToken;
      await http()
        .post(`/api/bookings/cancel/${token}`)
        .set('X-Tenant', b.slug)
        .expect(200);
    }, 30000);

    it('is blocked when the time is over', async () => {
      const b = await businessWithCatalog('Tiempo Vencido', {
        trialEndsAt: new Date(Date.now() - 1000),
      });
      const res = await http()
        .post('/api/bookings')
        .set('X-Tenant', b.slug)
        .send(booking(b, '10:00'));
      expect(res.status).toBe(403);
      expect((res.body as { message: string }).message).toBe(LIMIT_MESSAGE);
    }, 30000);

    it('never blocks a business without a trial', async () => {
      const b = await businessWithCatalog('Sin Prueba', {
        trialEndsAt: null,
        bookingQuota: null,
      });
      await http()
        .post('/api/bookings')
        .set('X-Tenant', b.slug)
        .send(booking(b, '10:00'))
        .expect(201);
    }, 30000);
  });

  describe('compensation', () => {
    it('the eraser deletes the business and everything scoped to it, and only that', async () => {
      const doomed = await signUp({
        businessName: 'Para Borrar',
        email: 'x@example.com',
      });
      const kept = await signUp({
        businessName: 'Para Quedarse',
        email: 'y@example.com',
      });

      await app.get<TenantEraser>(TENANT_ERASER).erase(doomed.id);

      expect(await tenants().findOne({ slug: doomed.slug })).toBeNull();
      for (const name of SCOPED_COLLECTIONS) {
        expect(await countOf(name, doomed.id)).toBe(0);
      }
      expect(await tenants().findOne({ slug: kept.slug })).not.toBeNull();
      expect(await countOf('admin_users', kept.id)).toBe(1);
      expect(await countOf('locations', kept.id)).toBe(1);
      // Idempotent.
      await app.get<TenantEraser>(TENANT_ERASER).erase(doomed.id);
    });

    it('a signup that fails halfway leaves no business and no scoped document', async () => {
      const seeder = app.get(CatalogSeeder);
      const spy = jest
        .spyOn(seeder, 'seedBase')
        .mockRejectedValueOnce(new Error('seed exploded'));
      const before = await tenants().countDocuments();
      const docs = async () => {
        let total = 0;
        for (const name of SCOPED_COLLECTIONS) {
          total += await connection.collection(name).countDocuments();
        }
        return total;
      };
      const scopedBefore = await docs();

      const res = await http()
        .post('/api/signup')
        .send(signupBody({ businessName: 'A Medias', email: 'z@example.com' }));

      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(await tenants().countDocuments()).toBe(before);
      expect(await tenants().findOne({ slug: 'a-medias' })).toBeNull();
      expect(await docs()).toBe(scopedBefore);
      // The slug is free again.
      await signUp({ businessName: 'A Medias', email: 'z@example.com' });
    });
  });
});
