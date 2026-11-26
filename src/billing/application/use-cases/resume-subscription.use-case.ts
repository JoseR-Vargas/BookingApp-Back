// ===== CASO DE USO: REANUDAR =====
// Undoes a pending cancellation before the period ends (spec 23).
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, ok } from '../../../shared/domain/result';
import { Subscription } from '../../domain/subscription';
import { resumeSubscription } from '../../domain/subscription.rules';
import { PAYMENT_GATEWAY, PaymentGateway } from '../ports/payment-gateway.port';
import {
  SUBSCRIPTION_READER,
  SUBSCRIPTION_WRITER,
  SubscriptionReader,
  SubscriptionWriter,
} from '../ports/subscription.repository';

@Injectable()
export class ResumeSubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_READER) private readonly reader: SubscriptionReader,
    @Inject(SUBSCRIPTION_WRITER) private readonly writer: SubscriptionWriter,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<Subscription>> {
    const current = await this.reader.find();
    const next = resumeSubscription(current, this.clock.now());
    if (!next.ok) return next;
    if (current?.externalPaymentId) {
      await this.gateway.resume(current.externalPaymentId);
    }
    await this.writer.save(next.value);
    return ok(next.value);
  }
}
