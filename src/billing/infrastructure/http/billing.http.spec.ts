import { Server } from 'node:http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { configureApp } from '../../../main';
import { CancelSubscriptionUseCase } from '../../application/use-cases/cancel-subscription.use-case';
import { GetSubscriptionStatusUseCase } from '../../application/use-cases/get-subscription-status.use-case';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import { ResumeSubscriptionUseCase } from '../../application/use-cases/resume-subscription.use-case';
import { StartCheckoutUseCase } from '../../application/use-cases/start-checkout.use-case';
import { buildBilling, signedEvent } from '../../billing.testing';
import { signFakeWebhook } from '../payment/fake-payment.gateway';
import { PaymentWebhookController } from './payment-webhook.controller';
import { SubscriptionController } from './subscription.controller';

/** The controllers over in-memory adapters; the admin guard is replaced by a pass-through. */
describe('billing HTTP (in-memory adapters)', () => {
  let app: NestExpressApplication;
  let b: ReturnType<typeof buildBilling>;

  beforeEach(async () => {
    b = buildBilling();
    const moduleRef = await Test.createTestingModule({
      controllers: [SubscriptionController, PaymentWebhookController],
      providers: [
        { provide: GetSubscriptionStatusUseCase, useValue: b.status },
        { provide: StartCheckoutUseCase, useValue: b.checkout },
        { provide: CancelSubscriptionUseCase, useValue: b.cancel },
        { provide: ResumeSubscriptionUseCase, useValue: b.resume },
        { provide: HandlePaymentWebhookUseCase, useValue: b.webhook },
      ],
    })
      .overrideGuard(AdminKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app);
    // Every request runs as the business "sur", like the tenant middleware would.
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      b.inBusiness('sur', next),
    );
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer() as Server);

  const pay = (event: Record<string, unknown>, signature?: string) => {
    const { rawBody, signature: signed } = signedEvent(event);
    const req = http()
      .post('/api/webhooks/payments')
      .set('Content-Type', 'application/json');
    if (signature !== '') req.set('x-payment-signature', signature ?? signed);
    return req.send(rawBody);
  };

  const succeeded = (over: Record<string, unknown> = {}) => ({
    id: 'evt_1',
    type: 'payment.succeeded',
    tenantSlug: 'sur',
    planId: 'pro',
    externalPaymentId: 'fake_pay_sur_pro',
    ...over,
  });

  describe('GET /api/admin/subscription', () => {
    it('answers the catalog of plans and no subscription for a business without one', async () => {
      const res = await http().get('/api/admin/subscription');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        plans: [
          {
            id: 'gratis',
            name: 'Gratis',
            limits: {
              professionals: 1,
              locations: 1,
              bookingsPerMonth: 50,
              publicPage: false,
              reminders: false,
            },
          },
          {
            id: 'pro',
            name: 'Pro',
            limits: {
              professionals: 3,
              locations: 2,
              bookingsPerMonth: 500,
              publicPage: true,
              reminders: true,
            },
          },
          {
            id: 'negocio',
            name: 'Negocio',
            limits: {
              professionals: 10,
              locations: 5,
              bookingsPerMonth: 2000,
              publicPage: true,
              reminders: true,
            },
          },
        ],
        subscription: null,
      });
    });
  });

  describe('POST /api/admin/subscription/checkout', () => {
    it('answers 200 with the checkout link', async () => {
      const res = await http()
        .post('/api/admin/subscription/checkout')
        .send({ planId: 'pro' });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body as object)).toEqual(['checkoutUrl']);
      expect((res.body as { checkoutUrl: string }).checkoutUrl).toContain(
        'http://localhost:5173/plan/fake-checkout?',
      );
    });

    it.each([[{ planId: 'x' }], [{}], [undefined]])(
      'answers 400 for %j',
      async (body) => {
        const res = await http()
          .post('/api/admin/subscription/checkout')
          .send(body);
        expect(res.status).toBe(400);
        expect((res.body as { message: string }).message).toBe(
          'El plan elegido no existe.',
        );
      },
    );

    it('answers 400 for the free plan', async () => {
      const res = await http()
        .post('/api/admin/subscription/checkout')
        .send({ planId: 'gratis' });
      expect(res.status).toBe(400);
    });
  });

  describe('the flow: pay, cancel, resume', () => {
    it('after the signed webhook the subscription is active; cancel and resume change cancelAtPeriodEnd', async () => {
      const paid = await pay(succeeded());
      expect(paid.status).toBe(200);
      expect(paid.body).toEqual({ ok: true, outcome: 'processed' });

      const got = await http().get('/api/admin/subscription');
      expect((got.body as { subscription: unknown }).subscription).toEqual({
        planId: 'pro',
        status: 'active',
        currentPeriodEnd: '2026-12-25T10:00:00.000Z',
        cancelAtPeriodEnd: false,
        limits: {
          professionals: 3,
          locations: 2,
          bookingsPerMonth: 500,
          publicPage: true,
          reminders: true,
        },
        usage: { professionals: 0, locations: 0, bookingsThisMonth: 0 },
      });

      const canceled = await http().post('/api/admin/subscription/cancel');
      expect(canceled.status).toBe(200);
      expect(canceled.body).toMatchObject({
        subscription: { status: 'active', cancelAtPeriodEnd: true },
      });

      const resumed = await http().post('/api/admin/subscription/resume');
      expect(resumed.status).toBe(200);
      expect(resumed.body).toMatchObject({
        subscription: { cancelAtPeriodEnd: false },
      });
    });

    it('cancel and resume without a subscription: 404; resume with nothing pending: 409', async () => {
      expect((await http().post('/api/admin/subscription/cancel')).status).toBe(
        404,
      );
      expect((await http().post('/api/admin/subscription/resume')).status).toBe(
        404,
      );
      await pay(succeeded());
      const res = await http().post('/api/admin/subscription/resume');
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        'La suscripción no tiene una cancelación pendiente.',
      );
    });
  });

  describe('POST /api/webhooks/payments', () => {
    it.each([
      ['no signature', ''],
      ['a wrong signature', 'deadbeef'],
      [
        'the signature of another secret',
        signFakeWebhook('other', JSON.stringify(succeeded())),
      ],
    ])('rejects %s with 401 and changes nothing', async (_name, signature) => {
      const res = await pay(succeeded(), signature);
      expect(res.status).toBe(401);
      const got = await http().get('/api/admin/subscription');
      expect((got.body as { subscription: unknown }).subscription).toBeNull();
      await expect(b.events.has('evt_1')).resolves.toBe(false);
    });

    it('rejects a body altered after signing', async () => {
      const { rawBody, signature } = signedEvent(succeeded());
      const res = await http()
        .post('/api/webhooks/payments')
        .set('Content-Type', 'application/json')
        .set('x-payment-signature', signature)
        .send(rawBody.replace('"pro"', '"negocio"'));
      expect(res.status).toBe(401);
    });

    it('answers 200 duplicate for the same event twice and changes nothing', async () => {
      await pay(succeeded());
      const again = await pay(succeeded({ planId: 'negocio' }));
      // Different body, same id: it must be signed again, which `pay` does.
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ ok: true, outcome: 'duplicate' });
      const got = await http().get('/api/admin/subscription');
      expect(
        (got.body as { subscription: { planId: string } }).subscription.planId,
      ).toBe('pro');
    });

    it('answers 400 for a signed body that is not an event', async () => {
      const res = await pay({ hello: 'world' });
      expect(res.status).toBe(400);
    });

    it('answers 404 for an unknown business', async () => {
      const res = await pay(succeeded({ tenantSlug: 'nadie' }));
      expect(res.status).toBe(404);
    });
  });
});
