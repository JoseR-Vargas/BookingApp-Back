import { Injectable, Logger } from '@nestjs/common';
import { WhatsappConfig } from './whatsapp.config';
import { ListRow, ReplyButton, WhatsappSendResult } from './whatsapp.types';

const GRAPH_URL = 'https://graph.facebook.com';
// Vercel functions are capped at 10s; fail before the platform kills us.
const REQUEST_TIMEOUT_MS = 8000;

/** WhatsApp Cloud API limits; longer values are rejected by Meta. */
const LIMITS = {
  text: 4096,
  interactiveBody: 1024,
  buttonTitle: 20,
  listButton: 20,
  rowTitle: 24,
  rowDescription: 72,
  maxButtons: 3,
  maxRows: 10,
} as const;

const SKIPPED: WhatsappSendResult = {
  status: 'skipped',
  reason: 'not_configured',
};

/** Non-2xx answer from the Cloud API. Never carries credentials. */
export class WhatsappApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`WhatsApp API responded ${status}: ${describe(body)}`);
    this.name = 'WhatsappApiError';
  }
}

function describe(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const message = (body as { error?: { message?: unknown } }).error?.message;
    if (typeof message === 'string') return message;
    return JSON.stringify(body);
  }
  return String(body);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

@Injectable()
export class WhatsappClient {
  private readonly logger = new Logger(WhatsappClient.name);

  constructor(private readonly config: WhatsappConfig) {}

  sendText(to: string, body: string): Promise<WhatsappSendResult> {
    return this.send(
      this.message(to, 'text', {
        text: { body: truncate(body, LIMITS.text), preview_url: false },
      }),
    );
  }

  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: ReplyButton[],
  ): Promise<WhatsappSendResult> {
    if (buttons.length < 1 || buttons.length > LIMITS.maxButtons) {
      throw new RangeError(`Reply buttons must be 1-${LIMITS.maxButtons}`);
    }
    return this.send(
      this.message(to, 'interactive', {
        interactive: {
          type: 'button',
          body: { text: truncate(body, LIMITS.interactiveBody) },
          action: {
            buttons: buttons.map((button) => ({
              type: 'reply',
              reply: {
                id: button.id,
                title: truncate(button.title, LIMITS.buttonTitle),
              },
            })),
          },
        },
      }),
    );
  }

  async sendInteractiveList(
    to: string,
    body: string,
    buttonLabel: string,
    rows: ListRow[],
  ): Promise<WhatsappSendResult> {
    if (rows.length < 1 || rows.length > LIMITS.maxRows) {
      throw new RangeError(`List rows must be 1-${LIMITS.maxRows}`);
    }
    return this.send(
      this.message(to, 'interactive', {
        interactive: {
          type: 'list',
          body: { text: truncate(body, LIMITS.interactiveBody) },
          action: {
            button: truncate(buttonLabel, LIMITS.listButton),
            sections: [
              {
                rows: rows.map((row) => ({
                  id: row.id,
                  title: truncate(row.title, LIMITS.rowTitle),
                  ...(row.description
                    ? {
                        description: truncate(
                          row.description,
                          LIMITS.rowDescription,
                        ),
                      }
                    : {}),
                })),
              },
            ],
          },
        },
      }),
    );
  }

  sendTemplate(
    to: string,
    name: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<WhatsappSendResult> {
    return this.send(
      this.message(to, 'template', {
        template: {
          name,
          language: { code: languageCode },
          ...(bodyParams.length > 0
            ? {
                components: [
                  {
                    type: 'body',
                    // Meta rejects newlines/tabs in template parameters.
                    parameters: bodyParams.map((text) => ({
                      type: 'text',
                      text: text.replace(/\s+/g, ' ').trim(),
                    })),
                  },
                ],
              }
            : {}),
        },
      }),
    );
  }

  markAsRead(messageId: string): Promise<WhatsappSendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  private message(to: string, type: string, content: object): object {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      ...content,
    };
  }

  private async send(payload: object): Promise<WhatsappSendResult> {
    const { accessToken, phoneNumberId, apiVersion } = this.config;
    if (!accessToken || !phoneNumberId) {
      this.logger.warn(
        'WhatsApp sending is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID); message skipped',
      );
      return SKIPPED;
    }

    const response = await fetch(
      `${GRAPH_URL}/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // Keep the raw text for diagnostics.
    }

    if (!response.ok) throw new WhatsappApiError(response.status, body);

    const messages = (body as { messages?: { id?: unknown }[] } | null)
      ?.messages;
    const id = messages?.[0]?.id;
    return {
      status: 'sent',
      messageId: typeof id === 'string' ? id : undefined,
    };
  }
}
