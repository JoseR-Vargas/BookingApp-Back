export type InboundMessageType = 'text' | 'interactive_reply' | 'unsupported';

/** Provider-neutral view of one inbound WhatsApp message. */
export interface InboundMessage {
  /** Meta message id (`wamid...`), unique per message. */
  messageId: string;
  /** Sender WhatsApp id (phone number in international format, no `+`). */
  from: string;
  profileName?: string;
  /** Unix epoch seconds. */
  timestamp: number;
  type: InboundMessageType;
  text?: string;
  /** Set for `interactive_reply` (button or list selection). */
  replyId?: string;
  replyTitle?: string;
}

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export type WhatsappSendResult =
  | { status: 'sent'; messageId?: string }
  | { status: 'skipped'; reason: 'not_configured' };
