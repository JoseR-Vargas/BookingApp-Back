// ===== CASO DE USO: CONTRATAR UN PLAN =====
// The owner asks for a plan; the gateway creates the payment and the answer is
// the link to pay (spec 23). Nothing is stored until the gateway confirms.
import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_CONTEXT,
  TenantContext,
} from '../../../shared/application/tenant-context.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { InvalidPlan } from '../../domain/billing.errors';
import { isPlanId, planById } from '../../domain/plans';
import { PAYMENT_GATEWAY, PaymentGateway } from '../ports/payment-gateway.port';

export interface StartCheckoutOutcome {
  checkoutUrl: string;
  externalPaymentId: string;
}

@Injectable()
export class StartCheckoutUseCase {
  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
  ) {}

  async execute(command: {
    planId: unknown;
  }): Promise<Result<StartCheckoutOutcome>> {
    if (!isPlanId(command.planId)) {
      return err(new InvalidPlan('El plan elegido no existe.'));
    }
    if (command.planId === 'gratis') {
      return err(
        new InvalidPlan(
          `El plan ${planById('gratis').name} no requiere pago: elige un plan de pago.`,
        ),
      );
    }
    const checkout = await this.gateway.createCheckout({
      tenantSlug: this.context.current().slug,
      planId: command.planId,
    });
    return ok(checkout);
  }
}
