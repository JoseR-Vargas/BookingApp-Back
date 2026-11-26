import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { respond } from '../../../shared/infrastructure/http/respond';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import { PaymentEventOutcome } from '../../application/use-cases/apply-payment-event.use-case';
import { InvalidWebhookSignature } from '../../domain/billing.errors';

/** The header that carries the signature of the body. */
export const PAYMENT_SIGNATURE_HEADER = 'x-payment-signature';

/**
 * The public door of the payment gateway (spec 23): no guard and no
 * `X-Tenant` (the tenant middleware exempts it; the business comes from the
 * event). The signature is checked over the raw bytes; a body without a valid
 * one is rejected with 401 and logged, and nothing is recorded.
 */
@Controller('webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(private readonly webhook: HandlePaymentWebhookUseCase) {}

  @Post('payments')
  @HttpCode(200)
  async receive(
    @Req() request: { rawBody?: Buffer; ip?: string },
    @Headers(PAYMENT_SIGNATURE_HEADER) signature: string | undefined,
  ): Promise<{ ok: true; outcome: PaymentEventOutcome }> {
    const result = await this.webhook.execute({
      rawBody: request.rawBody?.toString('utf8') ?? '',
      signature,
    });
    if (!result.ok && result.error instanceof InvalidWebhookSignature) {
      this.logger.warn(
        `Rejected a payment webhook with an invalid signature (ip: ${request.ip ?? 'unknown'}).`,
      );
    }
    return { ok: true, outcome: respond(result).outcome };
  }
}
