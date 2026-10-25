import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import {
  LoggingWhatsappMessageHandler,
  WhatsappMessageHandler,
} from './whatsapp-message.handler';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

/**
 * Inbound side: webhook, idempotency and conversation state. Re-exports the
 * outbound client/config. Replace the WhatsappMessageHandler provider to plug
 * the bot in.
 */
@Module({
  imports: [
    WhatsappApiModule,
    MongooseModule.forFeature([
      { name: ProcessedMessage.name, schema: ProcessedMessageSchema },
      { name: ConversationState.name, schema: ConversationStateSchema },
    ]),
  ],
  controllers: [WhatsappWebhookController],
  providers: [
    ProcessedMessageService,
    ConversationStateService,
    {
      provide: WhatsappMessageHandler,
      useClass: LoggingWhatsappMessageHandler,
    },
  ],
  exports: [WhatsappApiModule, ConversationStateService],
})
export class WhatsappModule {}
