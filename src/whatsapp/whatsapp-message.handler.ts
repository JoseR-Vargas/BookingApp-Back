import { Injectable, Logger } from '@nestjs/common';
import { InboundMessage } from './whatsapp.types';

/**
 * Injection token and contract for whatever reacts to inbound messages.
 * The webhook only depends on this abstraction; the bot provides the real one.
 */
export abstract class WhatsappMessageHandler {
  abstract handle(message: InboundMessage): Promise<void>;
}

/** Default handler until a bot is wired in: records the event, no content. */
@Injectable()
export class LoggingWhatsappMessageHandler extends WhatsappMessageHandler {
  private readonly logger = new Logger(LoggingWhatsappMessageHandler.name);

  handle(message: InboundMessage): Promise<void> {
    this.logger.log(
      `Inbound WhatsApp message ${message.messageId} (${message.type}) received; no bot handler registered`,
    );
    return Promise.resolve();
  }
}
