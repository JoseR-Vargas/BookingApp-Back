// ===== ADAPTADOR: ENVÍO POR WHATSAPP =====
// The reminder through the client that already exists (spec 24). The client
// sends free text; the Cloud API only accepts it inside the 24 hours of a
// conversation, which is a limit of the provider and not of this adapter.

import { Injectable, Logger } from '@nestjs/common';
import { WhatsappClient } from '../../../whatsapp/whatsapp.client';
import { WhatsappConfig } from '../../../whatsapp/whatsapp.config';
import {
  MessageSendResult,
  MessageSender,
  OutgoingMessage,
} from '../../application/ports/message-sender.port';

@Injectable()
export class WhatsappMessageSender implements MessageSender {
  readonly channel = 'whatsapp' as const;

  private readonly logger = new Logger(WhatsappMessageSender.name);

  constructor(
    private readonly client: WhatsappClient,
    private readonly config: WhatsappConfig,
  ) {}

  async send(message: OutgoingMessage): Promise<MessageSendResult> {
    if (!this.config.isSendingConfigured()) {
      this.logger.warn(
        'Reminder skipped: WhatsApp sending is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)',
      );
      return {
        ok: false,
        skipped: true,
        error:
          'WhatsApp no está configurado (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).',
      };
    }
    try {
      const result = await this.client.sendText(message.to, message.body);
      if (result.status === 'skipped') {
        return {
          ok: false,
          skipped: true,
          error: 'WhatsApp no está configurado.',
        };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo enviar el recordatorio por WhatsApp.',
      };
    }
  }
}
