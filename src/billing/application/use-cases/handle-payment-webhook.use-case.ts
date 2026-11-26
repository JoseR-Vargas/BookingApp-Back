// ===== CASO DE USO: WEBHOOK DE LA PASARELA =====
// The public door of the gateway (spec 23): the signature is verified before
// anything else; the business comes from the event itself and the rest runs
// inside its scope.
import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_SCOPE,
  TenantScope,
} from '../../../shared/application/tenant-context.port';
import { Result, err } from '../../../shared/domain/result';
import { TenantService } from '../../../tenancy/application/tenant.service';
import {
  InvalidPaymentEvent,
  InvalidWebhookSignature,
} from '../../domain/billing.errors';
import { PAYMENT_GATEWAY, PaymentGateway } from '../ports/payment-gateway.port';
import {
  ApplyPaymentEventUseCase,
  PaymentEventOutcome,
} from './apply-payment-event.use-case';

export interface WebhookCommand {
  /** The body exactly as received (the signature is over these bytes). */
  rawBody: string;
  signature: string | undefined;
}

@Injectable()
export class HandlePaymentWebhookUseCase {
  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly tenants: TenantService,
    @Inject(TENANT_SCOPE) private readonly scope: TenantScope,
    private readonly apply: ApplyPaymentEventUseCase,
  ) {}

  async execute(
    command: WebhookCommand,
  ): Promise<Result<{ outcome: PaymentEventOutcome }>> {
    if (!this.gateway.verifySignature(command.rawBody, command.signature)) {
      return err(new InvalidWebhookSignature());
    }
    const event = this.gateway.parseEvent(command.rawBody);
    if (!event) {
      return err(
        new InvalidPaymentEvent(
          'El evento de pago no tiene el formato esperado.',
        ),
      );
    }
    const resolved = await this.tenants.resolve(event.tenantSlug);
    if (!resolved.ok) return resolved;
    const tenant = resolved.value;
    return this.scope.run(
      { id: tenant.id, slug: tenant.slug, isDefault: tenant.isDefault },
      () => this.apply.execute(event),
    );
  }
}
