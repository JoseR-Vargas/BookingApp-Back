import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CatalogModule } from '../catalog/catalog.module';
import { BotHandler } from './bot/bot.handler';
import { ConversationStateService } from './conversation-state.service';
import { ProcessedMessageService } from './processed-message.service';
import {
  ConversationState,
  ConversationStateSchema,
} from './schemas/conversation-state.schema';
import {
  ProcessedMessage,
  ProcessedMessageSchema,
} from './schemas/processed-message.schema';
import { WhatsappApiModule } from './whatsapp-api.module';
import { WhatsappMessageHandler } from './whatsapp-message.handler';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

/**
 * Inbound side: webhook, idempotency and conversation state. Re-exports the
 * outbound client/config. The BotHandler is the WhatsappMessageHandler. This
 * module depends on BookingsModule, never the other way round: BookingsModule
 * may only import WhatsappApiModule (notifications) to avoid a cycle.
 */
@Module({
  imports: [
    WhatsappApiModule,
    BookingsModule,
    AvailabilityModule,
    CatalogModule,
    MongooseModule.forFeature([
      { name: ProcessedMessage.name, schema: ProcessedMessageSchema },
      { name: ConversationState.name, schema: ConversationStateSchema },
    ]),
  ],
  controllers: [WhatsappWebhookController],
  providers: [
    ProcessedMessageService,
    ConversationStateService,
    BotHandler,
    { provide: WhatsappMessageHandler, useExisting: BotHandler },
  ],
  exports: [WhatsappApiModule, ConversationStateService],
})
export class WhatsappModule {}
