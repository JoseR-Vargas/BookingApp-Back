// ===== MÓDULO DE RECORDATORIOS =====
// Composition root of the reminders (spec 24): the only place where its ports
// are bound to adapters. It reads the bookings of the business, its settings
// and its plan, and sends the reminders through WhatsApp or email.

import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { BillingModule } from '../billing/billing.module';
import { EmailModule } from '../email/email.module';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { TenancyModule } from '../tenancy/tenancy.module';
import { WhatsappApiModule } from '../whatsapp/whatsapp-api.module';
import { BUSINESS_TIME } from './application/ports/business-time.port';
import {
  MESSAGE_SENDERS,
  MessageSender,
  MessageSenders,
} from './application/ports/message-sender.port';
import { REMINDER_PLAN } from './application/ports/reminder-plan.port';
import { GetReminderSettingsUseCase } from './application/use-cases/get-reminder-settings.use-case';
import { SaveReminderSettingsUseCase } from './application/use-cases/save-reminder-settings.use-case';
import { SendDueRemindersUseCase } from './application/use-cases/send-due-reminders.use-case';
import { SendReminderUseCase } from './application/use-cases/send-reminder.use-case';
import { RemindersController } from './infrastructure/http/reminders.controller';
import { EmailMessageSender } from './infrastructure/messaging/email-message-sender';
import { selectMessageSenders } from './infrastructure/messaging/message-sender.factory';
import { WhatsappMessageSender } from './infrastructure/messaging/whatsapp-message-sender';
import { BillingReminderPlan } from './infrastructure/plan/billing-reminder-plan';
import { RemindersScheduler } from './infrastructure/scheduler/reminders-scheduler';
import { SystemBusinessTime } from './infrastructure/time/system-business-time';

@Module({
  imports: [
    // The bookings of the business, its cancel links and its plan.
    BookingsModule,
    BillingModule,
    TenancyModule,
    // The mailer and the public URL of the app.
    EmailModule,
    // The client of WhatsApp.
    WhatsappApiModule,
  ],
  controllers: [RemindersController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: BUSINESS_TIME, useClass: SystemBusinessTime },
    // One sender per channel; the use case picks the one the client needs.
    {
      provide: MESSAGE_SENDERS,
      inject: [WhatsappMessageSender, EmailMessageSender],
      useFactory: (
        whatsapp: MessageSender,
        email: MessageSender,
      ): MessageSenders =>
        selectMessageSenders(process.env, { whatsapp, email }),
    },
    { provide: REMINDER_PLAN, useClass: BillingReminderPlan },
    WhatsappMessageSender,
    EmailMessageSender,
    BillingReminderPlan,
    GetReminderSettingsUseCase,
    SaveReminderSettingsUseCase,
    SendReminderUseCase,
    SendDueRemindersUseCase,
    // The round that sends the reminders every X minutes.
    RemindersScheduler,
  ],
  exports: [SendDueRemindersUseCase],
})
export class RemindersModule {}
