// The panel of the owner of the system against the real application and the
// integration database (spec 25): the list of the businesses, the detail, the
// metrics, the actions and the key that opens them.
process.env.MONGO_URI = 'mongodb://localhost:27018/booking_platform_int_test';
process.env.ADMIN_API_KEY = 'platform-int-admin-key';
process.env.PLATFORM_API_KEY = 'platform-int-key';
process.env.ADMIN_USERNAME = '';
process.env.SIGNUP_RATE_LIMIT_MAX = '100';
process.env.PUBLIC_RATE_LIMIT_PER_MINUTE = '1000';
delete process.env.GMAIL_USER;

import { getConnectionToken } from '@nestjs/mongoose';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../main';
import { TenantService } from '../tenancy/application/tenant.service';

const OWNER = { 'x-platform-key': 'platform-int-key' };
const ADMIN = { Authorization: 'Bearer platform-int-admin-key' };

describe('the owner panel (integration)', () => {
  let app: NestExpressApplication;
  let connection: Connection;
  let sur: string;
  let norte: string;

  const http = () => request(app.getHttpServer());

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

    const tenants = app.get(TenantService);
    await tenants.create({ slug: 'sur', name: 'Barbería Sur' });
    await tenants.create({ slug: 'norte', name: 'Norte' });
    const rows = await connection
      .collection('tenants')
      .find({}, { projection: { slug: 1 } })
      .toArray();
    sur = String(rows.find((row) => row.slug === 'sur')!._id);
    norte = String(rows.find((row) => row.slug === 'norte')!._id);

    // The data of the business "sur": a professional, a service, a location
    // and two bookings (with the data of a client inside).
    const surId = new Types.ObjectId(sur);
    await connection.collection('professionals').insertOne({
      tenantId: surId,
      id: 'alex-garcia',
      name: 'Alex García',
      active: true,
    });
    await connection.collection('services').insertOne({
      tenantId: surId,
      id: 'corte',
      name: 'Corte',
      active: true,
      professionals: ['alex-garcia'],
    });
    await connection.collection('locations').insertOne({
      tenantId: surId,
      id: 'principal',
      name: 'Principal',
      active: true,
    });
    await connection.collection('bookings').insertMany([
      {
        tenantId: surId,
        client: {
          name: 'Juan Perez',
          phone: '5491155551234',
          email: 'juan@example.com',
        },
        professional: { id: 'alex-garcia', name: 'Alex García' },
        services: [{ id: 'corte', name: 'Corte' }],
        location: { id: 'principal', name: 'Principal' },
        date: '2026-11-26',
        time: '10:00',
        slots: ['10:00'],
        status: 'confirmed',
        createdAt: new Date(),
      },
      {
        tenantId: surId,
        client: { name: 'Maria Gomez', phone: '5491155559999' },
        professional: { id: 'alex-garcia', name: 'Alex García' },
        services: [{ id: 'corte', name: 'Corte' }],
        location: { id: 'principal', name: 'Principal' },
        date: '2026-11-26',
        time: '11:00',
        slots: ['11:00'],
        status: 'confirmed',
        createdAt: new Date(),
      },
    ]);
    await connection.collection('bookings').insertOne({
      tenantId: new Types.ObjectId(norte),
      client: { name: 'Luis Norte', phone: '5491155550000' },
      professional: { id: 'otro', name: 'Otro' },
      services: [{ id: 'otro-servicio', name: 'Otro' }],
      date: '2026-11-26',
      time: '09:00',
      slots: ['09:00'],
      status: 'confirmed',
      createdAt: new Date(),
    });
  }, 60000);

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  describe('the key', () => {
    it('the admin key of a business does not open the panel', async () => {
      const res = await http().get('/api/platform/tenants').set(ADMIN);

      expect(res.status).toBe(401);
    });

    it('the platform key does not open the routes of a business', async () => {
      const res = await http()
        .get('/api/admin/catalog')
        .set(OWNER)
        .set('X-Tenant', 'sur');

      expect(res.status).toBe(401);
    });

    it('without a key the panel stays closed', async () => {
      const res = await http().get('/api/platform/tenants');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/platform/tenants', () => {
    it('answers the signals of every business', async () => {
      const res = await http().get('/api/platform/tenants').set(OWNER);

      expect(res.status).toBe(200);
      const businesses = res.body.businesses as {
        id: string;
        slug: string;
        name: string;
        status: string;
        plan: unknown;
        subscriptionStatus: unknown;
        trial: unknown;
        bookingsThisMonth: number;
        storage: { usedBytes: number; quotaBytes: number | null };
        lastUseAt: string | null;
      }[];
      expect(businesses.map((b) => b.slug).sort()).toEqual(['norte', 'sur']);
      const south = businesses.find((b) => b.slug === 'sur')!;
      expect(south).toMatchObject({
        id: sur,
        name: 'Barbería Sur',
        status: 'active',
        plan: null,
        subscriptionStatus: null,
        trial: null,
        bookingsThisMonth: 2,
      });
      expect(south.lastUseAt).not.toBeNull();
      expect(south.storage.quotaBytes).toBeNull();
    });

    it('never answers the data of a client', async () => {
      const res = await http().get('/api/platform/tenants').set(OWNER);
      const body = JSON.stringify(res.body);

      expect(body).not.toContain('Juan Perez');
      expect(body).not.toContain('Maria Gomez');
      expect(body).not.toContain('juan@example.com');
      expect(body).not.toContain('5491155551234');
      expect(body).not.toContain('Luis Norte');
    });
  });

  describe('GET /api/platform/tenants/:id', () => {
    it('answers the breakdown of the bookings of the business', async () => {
      const res = await http().get(`/api/platform/tenants/${sur}`).set(OWNER);

      expect(res.status).toBe(200);
      expect(res.body.breakdown).toEqual({
        professionals: [{ id: 'alex-garcia', bookings: 2 }],
        services: [{ id: 'corte', bookings: 2 }],
        locations: [{ id: 'principal', bookings: 2 }],
        catalog: { professionals: 1, services: 1, locations: 1 },
      });
      expect(JSON.stringify(res.body)).not.toContain('Juan Perez');
    });

    it('answers 404 for a business that does not exist', async () => {
      const res = await http()
        .get('/api/platform/tenants/0123456789abcdef01234567')
        .set(OWNER);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/platform/metrics', () => {
    it('answers the metrics of the installation', async () => {
      const res = await http().get('/api/platform/metrics').set(OWNER);
      expect(res.status).toBe(200);
      expect(res.body.businesses).toEqual({
        total: 2,
        active: 2,
        inTrial: 0,
        suspended: 0,
      });
      expect(res.body.bookings.thisMonth).toBe(3);
      expect(res.body.estimatedRevenueByPlan).toEqual([]);
      expect(res.body.generatedAt).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();
    });

    it('is cached: the second visit answers the same numbers without reading again', async () => {
      const first = await http().get('/api/platform/metrics').set(OWNER);
      const second = await http().get('/api/platform/metrics').set(OWNER);

      expect(first.body.generatedAt).toBe(second.body.generatedAt);
    });
  });

  describe('the actions of the owner', () => {
    it('suspending a business makes its own routes answer 403 and deletes nothing', async () => {
      const res = await http()
        .post(`/api/platform/tenants/${sur}/suspend`)
        .set(OWNER);

      expect(res.status).toBe(200);
      expect(res.body.business.status).toBe('suspended');

      const catalog = await http().get('/api/catalog').set('X-Tenant', 'sur');
      expect(catalog.status).toBe(403);
      expect((catalog.body as { message: string }).message).toBe(
        'Este negocio no está disponible.',
      );
      // Nothing is deleted.
      expect(
        await connection
          .collection('bookings')
          .countDocuments({ tenantId: new Types.ObjectId(sur) }),
      ).toBe(2);
      expect(
        await connection
          .collection('professionals')
          .countDocuments({ tenantId: new Types.ObjectId(sur) }),
      ).toBe(1);

      // Reactivating brings it back.
      const back = await http()
        .post(`/api/platform/tenants/${sur}/reactivate`)
        .set(OWNER);
      expect(back.status).toBe(200);
      await http().get('/api/catalog').set('X-Tenant', 'sur').expect(200);
    }, 60000);

    it('refuses to suspend the only business that answers', async () => {
      await http()
        .post(`/api/platform/tenants/${norte}/suspend`)
        .set(OWNER)
        .expect(200);

      const res = await http()
        .post(`/api/platform/tenants/${sur}/suspend`)
        .set(OWNER);

      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        'No se puede suspender el único negocio activo del sistema.',
      );

      await http()
        .post(`/api/platform/tenants/${norte}/reactivate`)
        .set(OWNER)
        .expect(200);
    }, 60000);

    it('extends the trial of a business', async () => {
      await connection.collection('tenants').updateOne(
        { _id: new Types.ObjectId(sur) },
        {
          $set: { trialEndsAt: new Date(Date.now() + 2 * 24 * 3600 * 1000) },
        },
      );

      const res = await http()
        .post(`/api/platform/tenants/${sur}/trial`)
        .set(OWNER)
        .send({ days: 7 });

      expect(res.status).toBe(200);
      const endsAt = new Date(
        (res.body.business as { trial: { endsAt: string } }).trial.endsAt,
      );
      expect(endsAt.getTime()).toBeGreaterThan(
        Date.now() + 8 * 24 * 3600 * 1000,
      );
    }, 60000);

    it('refuses to extend a trial that expired', async () => {
      await connection
        .collection('tenants')
        .updateOne(
          { _id: new Types.ObjectId(sur) },
          { $set: { trialEndsAt: new Date(Date.now() - 24 * 3600 * 1000) } },
        );

      const res = await http()
        .post(`/api/platform/tenants/${sur}/trial`)
        .set(OWNER)
        .send({ days: 7 });

      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        'La prueba de este negocio ya venció: reactívalo antes de extenderla.',
      );

      // Reactivating starts the trial again; then it can be extended.
      await http()
        .post(`/api/platform/tenants/${sur}/reactivate`)
        .set(OWNER)
        .expect(200);
      await http()
        .post(`/api/platform/tenants/${sur}/trial`)
        .set(OWNER)
        .send({ days: 7 })
        .expect(200);
    }, 60000);

    it('changes the plan of a business by hand and leaves the subscription written', async () => {
      const res = await http()
        .post(`/api/platform/tenants/${sur}/plan`)
        .set(OWNER)
        .send({ planId: 'pro' });

      expect(res.status).toBe(200);
      expect((res.body.business as { plan: { id: string } }).plan.id).toBe(
        'pro',
      );

      const subscription = await connection
        .collection('subscriptions')
        .findOne({ tenantId: new Types.ObjectId(sur) });
      expect(subscription?.planId).toBe('pro');
      expect(subscription?.status).toBe('active');
    }, 60000);

    it('refuses a plan that does not exist', async () => {
      const res = await http()
        .post(`/api/platform/tenants/${sur}/plan`)
        .set(OWNER)
        .send({ planId: 'platino' });

      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe(
        'El plan elegido no existe.',
      );
    }, 60000);
  });
});
