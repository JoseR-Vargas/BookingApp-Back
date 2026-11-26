// ===== CASO DE USO: APLICAR UN EVENTO DE PAGO =====
// Runs INSIDE the scope of the business of the event. Idempotent: an event
// whose external id was already recorded changes nothing (spec 23).
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { BILLING_PERIOD_DAYS } from '../../domain/billing.constants';
import { InvalidPaymentEvent } from '../../domain/billing.errors';
import { PaymentEvent } from '../../domain/payment-event';
import { Subscription } from '../../domain/subscription';
import {
  PaidPeriod,
  activate,
  cancelNow,
  markPastDue,
  startTrialing,
} from '../../domain/subscription.rules';
import {
  PAYMENT_EVENT_LOG,
  PaymentEventLog,
} from '../ports/payment-event-log.port';
import {
  SUBSCRIPTION_READER,
  SUBSCRIPTION_WRITER,
  SubscriptionReader,
  SubscriptionWriter,
} from '../ports/subscription.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `processed`: the subscription changed; `ignored`: valid event that does not apply; `duplicate`: already seen. */
export type PaymentEventOutcome = 'processed' | 'ignored' | 'duplicate';

@Injectable()
export class ApplyPaymentEventUseCase {
  constructor(
    @Inject(SUBSCRIPTION_READER) private readonly reader: SubscriptionReader,
    @Inject(SUBSCRIPTION_WRITER) private readonly writer: SubscriptionWriter,
    @Inject(PAYMENT_EVENT_LOG) private readonly log: PaymentEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    event: PaymentEvent,
  ): Promise<Result<{ outcome: PaymentEventOutcome }>> {
    if (await this.log.has(event.id)) return ok({ outcome: 'duplicate' });
    const now = this.clock.now();
    const current = await this.reader.find();
    const next = this.transition(event, current, now);
    if (!next.ok && next.error instanceof InvalidPaymentEvent) return next;
    const processed = next.ok && next.value !== null;
    if (next.ok && next.value) await this.writer.save(next.value);
    await this.log.tryRecord({
      externalEventId: event.id,
      type: event.type,
      processedAt: now,
    });
    return ok({ outcome: processed ? 'processed' : 'ignored' });
  }

  /** The next subscription; `ok(null)` for a type nobody handles; an `Err` that is not an invalid event means "does not apply". */
  private transition(
    event: PaymentEvent,
    current: Subscription | null,
    now: Date,
  ): Result<Subscription | null> {
    switch (event.type) {
      case 'payment.succeeded':
      case 'subscription.trial_started': {
        const period = this.period(event, now);
        if (!period.ok) return period;
        return event.type === 'payment.succeeded'
          ? activate(current, period.value, now)
          : startTrialing(current, period.value, now);
      }
      case 'payment.failed':
        return markPastDue(current, now);
      case 'subscription.canceled':
        return cancelNow(current, now);
      default:
        return ok(null);
    }
  }

  private period(event: PaymentEvent, now: Date): Result<PaidPeriod> {
    if (!event.planId) {
      return err(
        new InvalidPaymentEvent(`El evento ${event.type} no indica el plan.`),
      );
    }
    return ok({
      planId: event.planId,
      externalPaymentId: event.externalPaymentId,
      currentPeriodEnd:
        event.currentPeriodEnd ??
        new Date(now.getTime() + BILLING_PERIOD_DAYS * DAY_MS),
    });
  }
}
