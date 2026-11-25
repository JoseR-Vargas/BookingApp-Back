// ===== REMITENTE DE CORREO =====
// How a mail leaves the system. Swapping the provider is a new adapter.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
