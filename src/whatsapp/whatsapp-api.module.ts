import { Module } from '@nestjs/common';
import { AdminBookingNotifier } from './admin-booking.notifier';
import { WhatsappClient } from './whatsapp.client';
import { WhatsappConfig } from './whatsapp.config';

/**
 * Outbound side only: config + Cloud API client + admin booking notifier. It deliberately imports no
 * feature module, so BookingsModule (notifications) and the bot can both use
 * it without a circular dependency. ConfigService comes from the global
 * ConfigModule registered in AppModule.
 */
@Module({
  providers: [WhatsappConfig, WhatsappClient, AdminBookingNotifier],
  exports: [WhatsappConfig, WhatsappClient, AdminBookingNotifier],
})
export class WhatsappApiModule {}
