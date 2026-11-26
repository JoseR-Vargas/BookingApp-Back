// ===== MÓDULO DE PLANES Y COBRO =====
// Composition root of billing (spec 23): the only place where its ports are
// bound to adapters. The payment gateway is chosen by `PAYMENT_GATEWAY`; an
// unknown value makes the application fail at startup.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CLOCK } from '../shared/application/clock.port';
import { PLAN_GATE } from '../shared/application/plan-gate.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PAYMENT_EVENT_LOG } from './application/ports/payment-event-log.port';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { PLAN_USAGE_READER } from './application/ports/plan-usage.reader';
import {
  SUBSCRIPTION_READER,
  SUBSCRIPTION_WRITER,
} from './application/ports/subscription.repository';
import { ApplyPaymentEventUseCase } from './application/use-cases/apply-payment-event.use-case';
import { CancelSubscriptionUseCase } from './application/use-cases/cancel-subscription.use-case';
import { CheckPlanLimitUseCase } from './application/use-cases/check-plan-limit.use-case';
import { GetSubscriptionStatusUseCase } from './application/use-cases/get-subscription-status.use-case';
import { HandlePaymentWebhookUseCase } from './application/use-cases/handle-payment-webhook.use-case';
import { ResumeSubscriptionUseCase } from './application/use-cases/resume-subscription.use-case';
import { StartCheckoutUseCase } from './application/use-cases/start-checkout.use-case';
import { FakeCheckoutController } from './infrastructure/http/fake-checkout.controller';
import { PaymentWebhookController } from './infrastructure/http/payment-webhook.controller';
import { SubscriptionController } from './infrastructure/http/subscription.controller';
import { selectPaymentGateway } from './infrastructure/payment/payment-gateway.factory';
import { MongoPaymentEventLog } from './infrastructure/persistence/mongo/mongo-payment-event.log';
import { MongoPlanUsageReader } from './infrastructure/persistence/mongo/mongo-plan-usage.reader';
import { MongoSubscriptionRepository } from './infrastructure/persistence/mongo/mongo-subscription.repository';
import {
  PaymentEventRecord,
  PaymentEventSchema,
} from './infrastructure/persistence/mongo/payment-event.entity';
import {
  SubscriptionRecord,
  SubscriptionSchema,
} from './infrastructure/persistence/mongo/subscription.entity';
import { SubscriptionPlanGate } from './infrastructure/subscription-plan-gate';

@Module({
  imports: [
    // The business of the request, its scope and the tenant service.
    TenancyModule,
    MongooseModule.forFeature([
      { name: SubscriptionRecord.name, schema: SubscriptionSchema },
      { name: PaymentEventRecord.name, schema: PaymentEventSchema },
    ]),
  ],
  controllers: [
    SubscriptionController,
    PaymentWebhookController,
    FakeCheckoutController,
  ],
  providers: [
    MongoSubscriptionRepository,
    { provide: SUBSCRIPTION_READER, useExisting: MongoSubscriptionRepository },
    { provide: SUBSCRIPTION_WRITER, useExisting: MongoSubscriptionRepository },
    { provide: PAYMENT_EVENT_LOG, useClass: MongoPaymentEventLog },
    { provide: PLAN_USAGE_READER, useClass: MongoPlanUsageReader },
    // PAYMENT_GATEWAY picks the adapter (default `fake`); a bad value throws here.
    {
      provide: PAYMENT_GATEWAY,
      useFactory: () => selectPaymentGateway(process.env),
    },
    { provide: CLOCK, useClass: SystemClock },
    { provide: PLAN_GATE, useClass: SubscriptionPlanGate },
    GetSubscriptionStatusUseCase,
    StartCheckoutUseCase,
    CancelSubscriptionUseCase,
    ResumeSubscriptionUseCase,
    CheckPlanLimitUseCase,
    ApplyPaymentEventUseCase,
    HandlePaymentWebhookUseCase,
    SubscriptionPlanGate,
  ],
  exports: [PLAN_GATE, GetSubscriptionStatusUseCase],
})
export class BillingModule {}
