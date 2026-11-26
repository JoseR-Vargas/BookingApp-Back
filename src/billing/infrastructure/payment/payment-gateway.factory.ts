// ===== ELECCIÓN DE LA PASARELA =====
// The gateway is chosen by configuration when the application starts (spec
// 23). An unknown value fails at startup with a clear message: a typo must not
// silently run the fake gateway in production.
import { PaymentGateway } from '../../application/ports/payment-gateway.port';
import { FakePaymentGateway } from './fake-payment.gateway';

type Env = Record<string, string | undefined>;

/** The values `PAYMENT_GATEWAY` accepts. A real provider adds its adapter and one entry here. */
export const SUPPORTED_PAYMENT_GATEWAYS = ['fake'] as const;

const DEV_WEBHOOK_SECRET = 'dev-only-fake-webhook-secret';
const DEFAULT_FAKE_CHECKOUT_URL = 'http://localhost:5173/plan/fake-checkout';

/** Builds the gateway named by `PAYMENT_GATEWAY` (default `fake`). */
export function selectPaymentGateway(env: Env): PaymentGateway {
  const chosen = (env.PAYMENT_GATEWAY ?? '').trim() || 'fake';
  if (chosen !== 'fake') {
    throw new Error(
      `PAYMENT_GATEWAY="${chosen}" is not supported. Supported values: ${SUPPORTED_PAYMENT_GATEWAYS.join(', ')}.`,
    );
  }
  const secret = (env.PAYMENT_WEBHOOK_SECRET ?? '').trim();
  if (!secret && env.NODE_ENV === 'production') {
    throw new Error('PAYMENT_WEBHOOK_SECRET is required in production.');
  }
  return new FakePaymentGateway({
    secret: secret || DEV_WEBHOOK_SECRET,
    checkoutBaseUrl:
      (env.PAYMENT_FAKE_CHECKOUT_URL ?? '').trim() || DEFAULT_FAKE_CHECKOUT_URL,
  });
}
