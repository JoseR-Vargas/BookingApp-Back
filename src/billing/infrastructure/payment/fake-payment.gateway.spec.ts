import { FakePaymentGateway, signFakeWebhook } from './fake-payment.gateway';
import { selectPaymentGateway } from './payment-gateway.factory';

const SECRET = 'test-secret';
const gateway = new FakePaymentGateway({
  secret: SECRET,
  checkoutBaseUrl: 'http://localhost:5173/plan/fake-checkout',
});

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'evt_1',
    type: 'payment.succeeded',
    tenantSlug: 'sur',
    planId: 'pro',
    externalPaymentId: 'fake_pay_sur_pro',
    currentPeriodEnd: '2026-12-25T10:00:00.000Z',
    ...over,
  });

describe('FakePaymentGateway', () => {
  it('creates a deterministic payment with a local checkout link', async () => {
    const first = await gateway.createCheckout({
      tenantSlug: 'sur',
      planId: 'pro',
    });
    const second = await gateway.createCheckout({
      tenantSlug: 'sur',
      planId: 'pro',
    });
    expect(first).toEqual(second);
    expect(first.externalPaymentId).toBe('fake_pay_sur_pro');
    const url = new URL(first.checkoutUrl);
    expect(url.origin + url.pathname).toBe(
      'http://localhost:5173/plan/fake-checkout',
    );
    expect(url.searchParams.get('payment')).toBe('fake_pay_sur_pro');
    expect(url.searchParams.get('plan')).toBe('pro');
    expect(url.searchParams.get('tenant')).toBe('sur');
  });

  it('verifies the HMAC-SHA256 hex signature of the raw body', () => {
    const raw = body();
    expect(gateway.verifySignature(raw, signFakeWebhook(SECRET, raw))).toBe(
      true,
    );
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['garbage', 'not-a-signature'],
    ['of another secret', signFakeWebhook('other', body())],
  ])('rejects a %s signature', (_name, signature) => {
    expect(gateway.verifySignature(body(), signature)).toBe(false);
  });

  it('rejects a signature of a different body', () => {
    const signature = signFakeWebhook(SECRET, body());
    expect(
      gateway.verifySignature(body({ planId: 'negocio' }), signature),
    ).toBe(false);
  });

  it('understands the event of a body', () => {
    expect(gateway.parseEvent(body())).toEqual({
      id: 'evt_1',
      type: 'payment.succeeded',
      tenantSlug: 'sur',
      planId: 'pro',
      externalPaymentId: 'fake_pay_sur_pro',
      currentPeriodEnd: new Date('2026-12-25T10:00:00.000Z'),
    });
  });

  it('understands an event with only the required fields', () => {
    expect(
      gateway.parseEvent(
        JSON.stringify({ id: 'e', type: 'payment.failed', tenantSlug: 'sur' }),
      ),
    ).toEqual({
      id: 'e',
      type: 'payment.failed',
      tenantSlug: 'sur',
      planId: null,
      externalPaymentId: null,
      currentPeriodEnd: null,
    });
  });

  it.each([
    ['not JSON', 'nope'],
    ['not an object', '[]'],
    ['no id', JSON.stringify({ type: 'x', tenantSlug: 's' })],
    ['no type', JSON.stringify({ id: 'x', tenantSlug: 's' })],
    ['no tenantSlug', JSON.stringify({ id: 'x', type: 'x' })],
    ['an unknown plan', body({ planId: 'enterprise' })],
    ['an invalid date', body({ currentPeriodEnd: 'tomorrow' })],
  ])('does not understand %s', (_name, raw) => {
    expect(gateway.parseEvent(raw)).toBeNull();
  });

  it('simulates the cancellation and the resume, recording them', async () => {
    await gateway.cancelAtPeriodEnd('fake_pay_sur_pro');
    await gateway.resume('fake_pay_sur_pro');
    expect(gateway.calls).toEqual([
      { action: 'cancelAtPeriodEnd', externalPaymentId: 'fake_pay_sur_pro' },
      { action: 'resume', externalPaymentId: 'fake_pay_sur_pro' },
    ]);
  });
});

describe('selectPaymentGateway (PAYMENT_GATEWAY)', () => {
  it('defaults to the fake gateway', () => {
    expect(selectPaymentGateway({})).toBeInstanceOf(FakePaymentGateway);
    expect(selectPaymentGateway({ PAYMENT_GATEWAY: 'fake' })).toBeInstanceOf(
      FakePaymentGateway,
    );
    expect(selectPaymentGateway({ PAYMENT_GATEWAY: '  ' })).toBeInstanceOf(
      FakePaymentGateway,
    );
  });

  it('uses PAYMENT_WEBHOOK_SECRET to sign and verify', () => {
    const chosen = selectPaymentGateway({ PAYMENT_WEBHOOK_SECRET: 'abc' });
    expect(chosen.verifySignature('x', signFakeWebhook('abc', 'x'))).toBe(true);
  });

  it('uses PAYMENT_FAKE_CHECKOUT_URL for the checkout link', async () => {
    const chosen = selectPaymentGateway({
      PAYMENT_FAKE_CHECKOUT_URL: 'http://localhost:9/pay',
    });
    const { checkoutUrl } = await chosen.createCheckout({
      tenantSlug: 'a',
      planId: 'pro',
    });
    expect(checkoutUrl.startsWith('http://localhost:9/pay?')).toBe(true);
  });

  it('fails at startup, naming the value and the supported ones, for an unknown gateway', () => {
    expect(() => selectPaymentGateway({ PAYMENT_GATEWAY: 'stripe' })).toThrow(
      'PAYMENT_GATEWAY="stripe" is not supported. Supported values: fake.',
    );
  });

  it('refuses to run in production without PAYMENT_WEBHOOK_SECRET', () => {
    expect(() => selectPaymentGateway({ NODE_ENV: 'production' })).toThrow(
      'PAYMENT_WEBHOOK_SECRET is required in production.',
    );
    expect(() =>
      selectPaymentGateway({
        NODE_ENV: 'production',
        PAYMENT_WEBHOOK_SECRET: 's',
      }),
    ).not.toThrow();
  });
});
