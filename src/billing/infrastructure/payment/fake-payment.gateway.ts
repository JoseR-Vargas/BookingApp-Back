// ===== ADAPTADOR DE PRUEBA DE LA PASARELA =====
// The gateway of development, e2e and tests (spec 23): deterministic and with
// no network. Its "checkout link" points to a local URL; its webhooks are
// signed with an HMAC-SHA256 (hex) of the raw body using
// `PAYMENT_WEBHOOK_SECRET`. A test "pays" by posting a signed event.
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Checkout,
  CheckoutRequest,
  PaymentGateway,
} from '../../application/ports/payment-gateway.port';
import { PaymentEvent } from '../../domain/payment-event';
import { isPlanId } from '../../domain/plans';

export interface FakePaymentGatewayConfig {
  /** The HMAC secret that signs and verifies the webhooks. */
  secret: string;
  /** The page the owner is sent to (the front's fake checkout). */
  checkoutBaseUrl: string;
}

/** The signature the fake gateway puts in `x-payment-signature`: hex HMAC-SHA256 of the raw body. */
export const signFakeWebhook = (secret: string, rawBody: string): string =>
  createHmac('sha256', secret).update(rawBody).digest('hex');

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

export class FakePaymentGateway implements PaymentGateway {
  /** What the application asked of the gateway after the checkout, for tests. */
  readonly calls: {
    action: 'cancelAtPeriodEnd' | 'resume';
    externalPaymentId: string;
  }[] = [];

  constructor(private readonly config: FakePaymentGatewayConfig) {}

  createCheckout(request: CheckoutRequest): Promise<Checkout> {
    const externalPaymentId = `fake_pay_${request.tenantSlug}_${request.planId}`;
    const url = new URL(this.config.checkoutBaseUrl);
    url.searchParams.set('payment', externalPaymentId);
    url.searchParams.set('plan', request.planId);
    url.searchParams.set('tenant', request.tenantSlug);
    return Promise.resolve({ externalPaymentId, checkoutUrl: url.toString() });
  }

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = Buffer.from(signFakeWebhook(this.config.secret, rawBody));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  parseEvent(rawBody: string): PaymentEvent | null {
    let data: unknown;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return null;
    }
    const raw = data as Record<string, unknown>;
    const id = text(raw.id);
    const type = text(raw.type);
    const tenantSlug = text(raw.tenantSlug);
    if (!id || !type || !tenantSlug) return null;
    let planId: PaymentEvent['planId'] = null;
    if (raw.planId !== undefined && raw.planId !== null) {
      if (!isPlanId(raw.planId)) return null;
      planId = raw.planId;
    }
    let currentPeriodEnd: Date | null = null;
    if (raw.currentPeriodEnd !== undefined && raw.currentPeriodEnd !== null) {
      const parsed =
        typeof raw.currentPeriodEnd === 'string'
          ? new Date(raw.currentPeriodEnd)
          : null;
      if (!parsed || Number.isNaN(parsed.getTime())) return null;
      currentPeriodEnd = parsed;
    }
    return {
      id,
      type,
      tenantSlug,
      planId,
      externalPaymentId: text(raw.externalPaymentId),
      currentPeriodEnd,
    };
  }

  cancelAtPeriodEnd(externalPaymentId: string): Promise<void> {
    this.calls.push({ action: 'cancelAtPeriodEnd', externalPaymentId });
    return Promise.resolve();
  }

  resume(externalPaymentId: string): Promise<void> {
    this.calls.push({ action: 'resume', externalPaymentId });
    return Promise.resolve();
  }
}
