// ===== PAGO SIMULADO (SOLO DESARROLLO) =====
// The page the fake gateway sends the owner to. It shows the plan and a button that pays: the
// backend signs the event with the secret and applies it, so the secret never leaves the server.
// This route exists only when PAYMENT_GATEWAY=fake: with a real gateway the owner pays there.

import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
} from '../../application/ports/payment-gateway.port';
import { signFakeWebhook } from '../payment/fake-payment.gateway';

interface FakeCheckoutBody {
  plan?: unknown;
  tenant?: unknown;
}

@Controller('admin/subscription')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class FakeCheckoutController {
  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly webhook: HandlePaymentWebhookUseCase,
  ) {}

  @Post('fake-checkout')
  @HttpCode(200)
  async fakeCheckout(
    @Body() body: FakeCheckoutBody,
  ): Promise<{ ok: true; outcome: string }> {
    const secret = (this.gateway as unknown as { secret?: string }).secret;
    if (!secret) {
      throw new Error(
        'The simulated payment is only available with the fake gateway.',
      );
    }
    const plan = typeof body?.plan === 'string' ? body.plan : '';
    const tenant = typeof body?.tenant === 'string' ? body.tenant : '';
    if (!plan || !tenant) {
      throw new Error('The simulated payment needs the plan and the business.');
    }
    const event = {
      id: `fake_evt_${tenant}_${plan}_${Date.now()}`,
      type: 'payment.succeeded',
      tenantSlug: tenant,
      planId: plan,
      externalPaymentId: `fake_pay_${tenant}_${plan}`,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    const rawBody = JSON.stringify(event);
    const result = await this.webhook.execute({
      rawBody,
      signature: signFakeWebhook(secret, rawBody),
    });
    return { ok: true, outcome: result.ok ? result.value.outcome : 'rejected' };
  }
}
