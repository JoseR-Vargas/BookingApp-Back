// Spec 23 against the real application and the integration database: plans,
// limits, the signed webhook of the fake gateway, past_due, cancellation and
// the isolation between businesses.
process.env.MONGO_URI = 'mongodb://localhost:27018/booking_billing_int_test';
process.env.ADMIN_API_KEY = 'billing-int-key';
process.env.ADMIN_USERNAME = '';
process.env.SIGNUP_RATE_LIMIT_MAX = '100';
process.env.PUBLIC_RATE_LIMIT_PER_MINUTE = '1000';
process.env.PAYMENT_WEBHOOK_SECRET = 'billing-int-secret';
delete process.env.PAYMENT_GATEWAY; // the default: the fake gateway
delete process.env.GMAIL_USER;

import { getConnectionToken } from '@nestjs/mongoose';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../main';
import { TenantService } from '../tenancy/application/tenant.service';
import { signFakeWebhook } from './infrastructure/payment/fake-payment.gateway';

const SECRET = 'billing-int-secret';
const KEY = { Authorization: 'Bearer billing-int-key' };
const PASSWORD = 'a-long-password';
const TRIAL_MESSAGE = 'Este negocio alcanzó el límite de su prueba.';
const ENDED_MESSAGE =
  'La suscripción de este negocio terminó: no se aceptan reservas nuevas hasta que contrates un plan.';

describe('Plans and billing (integration)', () => {
  let app: NestExpressApplication;
  let connection: Connection;
  let eventCounter = 0;

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

  /** A signed-up business with one professional and one service. */
  async function business(name: string, patch: Record<string, unknown> = {}) {
    const res = await http()
      .post('/api/signup')
      .send({
        businessName: name,
        adminName: 'Ana',
        email: 'ana@example.com',
        password: PASSWORD,
      })
      .expect(201);
    const slug = (res.body as { tenant: { slug: string } }).tenant.slug;
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
    const record = await tenants().findOne({ slug });
    await tenants().updateOne({ slug }, { $set: patch });
    const as = { 'X-Tenant': slug, Cookie: cookie };
    const professional = await http()
      .post('/api/admin/professionals')
      .set(as)
      .send({ name: 'Luis', specialty: 'Barber', experience: '3 years' })
      .expect(201);
    const professionalId = (professional.body as { id: string }).id;
    const service = await http()
      .post('/api/admin/services')
      .set(as)
      .send({
        name: 'Corte',
        description: 'Corte',
        price: 1000,
        duration: 30,
        professionals: [professionalId],
      })
      .expect(201);
    return {
      slug,
      as,
      id: String(record!._id),
      professionalId,
      serviceId: (service.body as { id: string }).id,
    };
  }

  type Business = Awaited<ReturnType<typeof business>>;

  const booking = (b: Business, time: string) => ({
    client: { name: 'Juan', email: 'juan@example.com', phone: '1234567890' },
    services: [{ id: b.serviceId }],
    professional: { id: b.professionalId, name: 'Luis' },
    date: '2027-03-24',
    time,
  });

  /** What the fake gateway sends: the raw body and its HMAC signature. */
  const webhook = (event: Record<string, unknown>, secret = SECRET) => {
    const body = JSON.stringify({ id: `evt_${++eventCounter}`, ...event });
    return http()
      .post('/api/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-payment-signature', signFakeWebhook(secret, body))
      .send(body);
  };

  const subscribe = (b: Business, planId: string, extra = {}) =>
    webhook({
      type: 'payment.succeeded',
      tenantSlug: b.slug,
      planId,
      externalPaymentId: `fake_pay_${b.slug}_${planId}`,
      ...extra,
    }).expect(200);

  const subscription = (b: Business) =>
    connection
      .collection('subscriptions')
      .findOne({ tenantId: new Types.ObjectId(b.id) });

  const sessionPlan = async (b: Business) =>
    (
      (await http().get('/api/admin/session').set(b.as).expect(200)).body as {
        plan: unknown;
      }
    ).plan;

  it('shows the plans and no subscription; contracting answers a payment link; the session has plan: null', async () => {
    const b = await business('Plan Uno');

    const got = await http()
      .get('/api/admin/subscription')
      .set(b.as)
      .expect(200);
    expect(got.body).toMatchObject({
      subscription: null,
      plans: [{ id: 'gratis' }, { id: 'pro' }, { id: 'negocio' }],
    });
    expect(await sessionPlan(b)).toBeNull();

    const checkout = await http()
      .post('/api/admin/subscription/checkout')
      .set(b.as)
      .send({ planId: 'pro' })
      .expect(200);
    expect(Object.keys(checkout.body as object)).toEqual(['checkoutUrl']);
    const url = new URL((checkout.body as { checkoutUrl: string }).checkoutUrl);
    expect(url.hostname).toBe('localhost');
    expect(url.searchParams.get('plan')).toBe('pro');
    expect(url.searchParams.get('tenant')).toBe(b.slug);
    // Nothing is stored until the gateway confirms.
    expect(await subscription(b)).toBeNull();

    await http()
      .post('/api/admin/subscription/checkout')
      .set(b.as)
      .send({ planId: 'nope' })
      .expect(400);
  }, 60000);

  it('the signed webhook (no X-Tenant) activates the plan; the session and the panel show it with its limits and usage', async () => {
    const b = await business('Plan Dos');
    const paid = await subscribe(b, 'pro', {
      currentPeriodEnd: '2099-01-15T00:00:00.000Z',
    });
    expect(paid.body).toEqual({ ok: true, outcome: 'processed' });

    const expected = {
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: '2099-01-15T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      limits: {
        professionals: 3,
        locations: 2,
        bookingsPerMonth: 500,
        publicPage: true,
        reminders: true,
      },
      usage: { professionals: 1, locations: 1, bookingsThisMonth: 0 },
    };
    expect(await sessionPlan(b)).toEqual(expected);
    const got = await http()
      .get('/api/admin/subscription')
      .set(b.as)
      .expect(200);
    expect((got.body as { subscription: unknown }).subscription).toEqual(
      expected,
    );
    // The key answer stays exactly what it always was.
    const keyed = await http()
      .get('/api/admin/session')
      .set('X-Tenant', b.slug)
      .set(KEY);
    expect(keyed.body).toEqual({ ok: true });
  }, 60000);

  it('rejects a webhook without a valid signature (401), storing nothing', async () => {
    const b = await business('Sin Firma');
    const body = JSON.stringify({
      id: 'evt_forged',
      type: 'payment.succeeded',
      tenantSlug: b.slug,
      planId: 'negocio',
    });
    const forged = [
      () =>
        http()
          .post('/api/webhooks/payments')
          .set('Content-Type', 'application/json')
          .send(body),
      () =>
        http()
          .post('/api/webhooks/payments')
          .set('Content-Type', 'application/json')
          .set('x-payment-signature', 'bad')
          .send(body),
      () =>
        http()
          .post('/api/webhooks/payments')
          .set('Content-Type', 'application/json')
          .set('x-payment-signature', signFakeWebhook('other', body))
          .send(body),
    ];
    for (const req of forged) expect((await req()).status).toBe(401);
    expect(await subscription(b)).toBeNull();
    expect(
      await connection
        .collection('payment_events')
        .countDocuments({ externalEventId: 'evt_forged' }),
    ).toBe(0);
  }, 60000);

  it('the same event twice changes nothing; events of another business do not touch this one', async () => {
    const a = await business('Idem A');
    const other = await business('Idem B');
    const event = {
      id: 'evt_same',
      type: 'payment.succeeded',
      tenantSlug: a.slug,
      planId: 'pro',
      currentPeriodEnd: '2099-01-15T00:00:00.000Z',
    };
    const send = (e: Record<string, unknown>) => {
      const body = JSON.stringify(e);
      return http()
        .post('/api/webhooks/payments')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signFakeWebhook(SECRET, body))
        .send(body);
    };
    expect((await send(event)).body).toEqual({
      ok: true,
      outcome: 'processed',
    });
    const first = await subscription(a);
    // Same id, other content: still a duplicate.
    const again = await send({
      ...event,
      planId: 'negocio',
      currentPeriodEnd: '2100-01-01T00:00:00.000Z',
    });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, outcome: 'duplicate' });
    expect(await subscription(a)).toEqual(first);
    expect(
      await connection
        .collection('payment_events')
        .countDocuments({ externalEventId: 'evt_same' }),
    ).toBe(1);
    expect(await subscription(other)).toBeNull();
    expect(await sessionPlan(other)).toBeNull();
  }, 60000);

  it('answers 404 for an event of an unknown business and 400 for a signed body that is not an event', async () => {
    expect(
      (
        await webhook({
          type: 'payment.succeeded',
          tenantSlug: 'nadie',
          planId: 'pro',
        })
      ).status,
    ).toBe(404);
    expect((await webhook({ hello: 'world' })).status).toBe(400);
  }, 30000);

  it('enforces the limit of professionals with a 403 that names the limit and the plan, and never blocks reads', async () => {
    const b = await business('Limite Profesionales');
    await subscribe(b, 'pro', { currentPeriodEnd: '2099-01-15T00:00:00.000Z' });
    for (const name of ['Dos', 'Tres']) {
      await http()
        .post('/api/admin/professionals')
        .set(b.as)
        .send({ name, specialty: 'Barber', experience: '1' })
        .expect(201);
    }
    const blocked = await http()
      .post('/api/admin/professionals')
      .set(b.as)
      .send({ name: 'Cuatro', specialty: 'Barber', experience: '1' });
    expect(blocked.status).toBe(403);
    expect((blocked.body as { message: string }).message).toBe(
      'Alcanzaste el límite de profesionales del plan Pro (3 profesionales). Contrata el plan Negocio (hasta 10 profesionales) para ampliarlo.',
    );
    expect(
      await connection
        .collection('professionals')
        .countDocuments({ tenantId: new Types.ObjectId(b.id) }),
    ).toBe(3);
    // Reads and availability keep working.
    await http().get('/api/admin/catalog').set(b.as).expect(200);
    await http()
      .get(`/api/availability?date=2027-03-24&serviceIds=${b.serviceId}`)
      .set('X-Tenant', b.slug)
      .expect(200);
    await http().get('/api/catalog').set('X-Tenant', b.slug).expect(200);
    // Upgrading lifts the limit.
    await subscribe(b, 'negocio', {
      currentPeriodEnd: '2099-01-15T00:00:00.000Z',
    });
    await http()
      .post('/api/admin/professionals')
      .set(b.as)
      .send({ name: 'Cuatro', specialty: 'Barber', experience: '1' })
      .expect(201);
  }, 60000);

  it('enforces the limit of locations', async () => {
    const b = await business('Limite Locales');
    await subscribe(b, 'pro', { currentPeriodEnd: '2099-01-15T00:00:00.000Z' });
    await http()
      .post('/api/admin/locations')
      .set(b.as)
      .send({ name: 'Norte' })
      .expect(201);
    const blocked = await http()
      .post('/api/admin/locations')
      .set(b.as)
      .send({ name: 'Sur' });
    expect(blocked.status).toBe(403);
    expect((blocked.body as { message: string }).message).toBe(
      'Alcanzaste el límite de locales del plan Pro (2 locales). Contrata el plan Negocio (hasta 5 locales) para ampliarlo.',
    );
    await http().get('/api/admin/catalog').set(b.as).expect(200);
  }, 60000);

  it('gratis: the monthly limit of bookings answers 403 for new ones only; the panel, existing bookings and cancellation keep working', async () => {
    const b = await business('Gratis Reservas');
    await subscribe(b, 'gratis', {
      currentPeriodEnd: '2099-01-15T00:00:00.000Z',
    });
    const first = await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '10:00'));
    expect(first.status).toBe(201);
    // 49 more bookings of this month, behind the app's back (no slots: they do not collide).
    await connection.collection('bookings').insertMany(
      Array.from({ length: 49 }, () => ({
        tenantId: new Types.ObjectId(b.id),
        status: 'cancelled',
        createdAt: new Date(),
      })),
    );
    const blocked = await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '11:00'));
    expect(blocked.status).toBe(403);
    expect((blocked.body as { message: string }).message).toBe(
      'Alcanzaste el límite de reservas al mes del plan Gratis (50 reservas al mes). Contrata el plan Pro (hasta 500 reservas al mes) para ampliarlo.',
    );
    // A second professional is over the free limit too, and it names Pro.
    const pro = await http()
      .post('/api/admin/professionals')
      .set(b.as)
      .send({ name: 'Dos', specialty: 'Barber', experience: '1' });
    expect(pro.status).toBe(403);
    expect((pro.body as { message: string }).message).toContain('plan Pro');

    expect(await sessionPlan(b)).toMatchObject({
      planId: 'gratis',
      usage: { professionals: 1, locations: 1, bookingsThisMonth: 50 },
    });
    await http().get('/api/bookings').set(b.as).expect(200);
    await http().get('/api/catalog').set('X-Tenant', b.slug).expect(200);
    await http()
      .get(`/api/availability?date=2027-03-24&serviceIds=${b.serviceId}`)
      .set('X-Tenant', b.slug)
      .expect(200);
    const token = (first.body as { cancelToken: string }).cancelToken;
    await http()
      .post(`/api/bookings/cancel/${token}`)
      .set('X-Tenant', b.slug)
      .expect(200);
  }, 60000);

  it('bookings of another month do not count', async () => {
    const b = await business('Otro Mes');
    await subscribe(b, 'gratis', {
      currentPeriodEnd: '2099-01-15T00:00:00.000Z',
    });
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 2);
    await connection.collection('bookings').insertMany(
      Array.from({ length: 60 }, () => ({
        tenantId: new Types.ObjectId(b.id),
        status: 'cancelled',
        createdAt: lastMonth,
      })),
    );
    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '10:00'))
      .expect(201);
  }, 60000);

  it('past_due keeps the business accepting bookings; canceled stops new ones and keeps everything else', async () => {
    const b = await business('Impago');
    await subscribe(b, 'pro', { currentPeriodEnd: '2099-01-15T00:00:00.000Z' });
    await webhook({ type: 'payment.failed', tenantSlug: b.slug }).expect(200);
    expect(await sessionPlan(b)).toMatchObject({ status: 'past_due' });
    await http().get('/api/catalog').set('X-Tenant', b.slug).expect(200);
    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '10:00'))
      .expect(201);

    await webhook({ type: 'subscription.canceled', tenantSlug: b.slug }).expect(
      200,
    );
    expect(await sessionPlan(b)).toMatchObject({ status: 'canceled' });
    const blocked = await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '11:00'));
    expect(blocked.status).toBe(403);
    expect((blocked.body as { message: string }).message).toBe(ENDED_MESSAGE);
    await http().get('/api/bookings').set(b.as).expect(200);
    await http().get('/api/catalog').set('X-Tenant', b.slug).expect(200);
    await http()
      .get(`/api/availability?date=2027-03-24&serviceIds=${b.serviceId}`)
      .set('X-Tenant', b.slug)
      .expect(200);
    // Paying again brings it back.
    await subscribe(b, 'pro', { currentPeriodEnd: '2099-01-15T00:00:00.000Z' });
    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '11:00'))
      .expect(201);
  }, 60000);

  it('cancels at the end of the period (access stays), resumes before it, and blocks when the period ends', async () => {
    const b = await business('Cancela');
    await subscribe(b, 'pro', { currentPeriodEnd: '2099-01-15T00:00:00.000Z' });

    const canceled = await http()
      .post('/api/admin/subscription/cancel')
      .set(b.as)
      .expect(200);
    expect(canceled.body).toMatchObject({
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2099-01-15T00:00:00.000Z',
      },
    });
    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '10:00'))
      .expect(201);

    const resumed = await http()
      .post('/api/admin/subscription/resume')
      .set(b.as)
      .expect(200);
    expect(resumed.body).toMatchObject({
      subscription: { cancelAtPeriodEnd: false },
    });
    expect(
      (await http().post('/api/admin/subscription/resume').set(b.as)).status,
    ).toBe(409);

    await http().post('/api/admin/subscription/cancel').set(b.as).expect(200);
    // The period ends (set behind the app's back): the cancellation takes effect.
    await connection
      .collection('subscriptions')
      .updateOne(
        { tenantId: new Types.ObjectId(b.id) },
        { $set: { currentPeriodEnd: new Date(Date.now() - 1000) } },
      );
    expect(await sessionPlan(b)).toMatchObject({ status: 'canceled' });
    const blocked = await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '11:00'));
    expect(blocked.status).toBe(403);
    expect((blocked.body as { message: string }).message).toBe(ENDED_MESSAGE);
    expect(
      (await http().post('/api/admin/subscription/resume').set(b.as)).status,
    ).toBe(409);
  }, 60000);

  it('a business WITHOUT a subscription behaves as before: no plan limits, the trial still blocks', async () => {
    const b = await business('Sin Plan', { bookingQuota: 1 });
    for (const name of ['Dos', 'Tres', 'Cuatro']) {
      await http()
        .post('/api/admin/professionals')
        .set(b.as)
        .send({ name, specialty: 'Barber', experience: '1' })
        .expect(201);
    }
    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '10:00'))
      .expect(201);
    const blocked = await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '11:00'));
    expect(blocked.status).toBe(403);
    expect((blocked.body as { message: string }).message).toBe(TRIAL_MESSAGE);
  }, 60000);

  it('a subscription replaces the trial: a business that pays is not blocked by its old quota', async () => {
    const b = await business('Paga', { bookingQuota: 1 });
    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '10:00'))
      .expect(201);
    expect(
      (
        await http()
          .post('/api/bookings')
          .set('X-Tenant', b.slug)
          .send(booking(b, '11:00'))
      ).status,
    ).toBe(403);
    await subscribe(b, 'pro', { currentPeriodEnd: '2099-01-15T00:00:00.000Z' });
    await http()
      .post('/api/bookings')
      .set('X-Tenant', b.slug)
      .send(booking(b, '11:00'))
      .expect(201);
  }, 60000);

  it('the default business (no subscription, no trial) is never limited', async () => {
    for (let i = 0; i < 3; i++) {
      await http()
        .post('/api/admin/professionals')
        .set(KEY)
        .send({ name: `Viejo ${i}`, specialty: 'Barber', experience: '1' })
        .expect(201);
    }
  }, 30000);

  it('is owner only: a staff account and no credentials cannot use the plan routes', async () => {
    const b = await business('Roles');
    await http()
      .post('/api/admin/users')
      .set(b.as)
      .send({
        email: 'staff@example.com',
        name: 'Staff',
        password: PASSWORD,
        role: 'staff',
      })
      .expect(201);
    const login = await http()
      .post('/api/admin/session')
      .set('X-Tenant', b.slug)
      .send({ email: 'staff@example.com', password: PASSWORD })
      .expect(200);
    const staff = {
      'X-Tenant': b.slug,
      Cookie: (login.headers['set-cookie'] as unknown as string[])[0].split(
        ';',
      )[0],
    };
    for (const call of [
      () => http().get('/api/admin/subscription').set(staff),
      () =>
        http()
          .post('/api/admin/subscription/checkout')
          .set(staff)
          .send({ planId: 'pro' }),
      () => http().post('/api/admin/subscription/cancel').set(staff),
      () => http().post('/api/admin/subscription/resume').set(staff),
    ]) {
      expect((await call()).status).toBe(403);
    }
    expect(
      (await http().get('/api/admin/subscription').set('X-Tenant', b.slug))
        .status,
    ).toBe(401);
    // The legacy key counts as an owner.
    await http()
      .get('/api/admin/subscription')
      .set('X-Tenant', b.slug)
      .set(KEY)
      .expect(200);
  }, 60000);
});
