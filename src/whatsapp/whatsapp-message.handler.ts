import { InboundMessage } from './whatsapp.types';

/**
 * Injection token and contract for whatever reacts to inbound messages.
 * The webhook only depends on this abstraction; the bot provides the real one.
 */
export abstract class WhatsappMessageHandler {
  abstract handle(message: InboundMessage): Promise<void>;
}
