import { InboundMessage } from './whatsapp.types';

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function parseTimestamp(value: unknown): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.floor(seconds)
    : Math.floor(Date.now() / 1000);
}

function parseMessage(
  raw: unknown,
  profileNames: Map<string, string>,
): InboundMessage | null {
  if (!isObj(raw)) return null;
  const messageId = asString(raw.id);
  const from = asString(raw.from);
  if (!messageId || !from) return null;

  const message: InboundMessage = {
    messageId,
    from,
    timestamp: parseTimestamp(raw.timestamp),
    type: 'unsupported',
  };
  const profileName = profileNames.get(from);
  if (profileName) message.profileName = profileName;

  if (raw.type === 'text' && isObj(raw.text)) {
    const text = asString(raw.text.body);
    if (text !== undefined) {
      message.type = 'text';
      message.text = text;
    }
  } else if (raw.type === 'interactive' && isObj(raw.interactive)) {
    const reply = isObj(raw.interactive.button_reply)
      ? raw.interactive.button_reply
      : raw.interactive.list_reply;
    if (isObj(reply)) {
      const replyId = asString(reply.id);
      if (replyId) {
        message.type = 'interactive_reply';
        message.replyId = replyId;
        message.replyTitle = asString(reply.title);
      }
    }
  }
  return message;
}

/**
 * Normalizes a WhatsApp Cloud API webhook payload into inbound messages.
 * Status updates are ignored and malformed fragments are skipped, so a
 * validly signed but odd payload never throws.
 */
export function parseWebhookPayload(payload: unknown): InboundMessage[] {
  if (!isObj(payload)) return [];

  const messages: InboundMessage[] = [];
  for (const entry of asArray(payload.entry)) {
    if (!isObj(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isObj(change) || !isObj(change.value)) continue;

      const profileNames = new Map<string, string>();
      for (const contact of asArray(change.value.contacts)) {
        if (!isObj(contact)) continue;
        const waId = asString(contact.wa_id);
        const name = isObj(contact.profile)
          ? asString(contact.profile.name)
          : undefined;
        if (waId && name) profileNames.set(waId, name);
      }

      for (const raw of asArray(change.value.messages)) {
        const message = parseMessage(raw, profileNames);
        if (message) messages.push(message);
      }
    }
  }
  return messages;
}
