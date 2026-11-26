// ===== PUERTO: REGISTRO DE EVENTOS DE PAGO =====
// The events the gateway sent, kept by their external id so the same event
// twice changes nothing (spec 23). It is NOT tenant-scoped: the webhook finds
// the business from the event itself.

export interface PaymentEventEntry {
  externalEventId: string;
  type: string;
  processedAt: Date;
}

export interface PaymentEventLog {
  has(externalEventId: string): Promise<boolean>;
  /** Stores the entry; false (nothing stored) when the id was already there. */
  tryRecord(entry: PaymentEventEntry): Promise<boolean>;
}

export const PAYMENT_EVENT_LOG = Symbol('PAYMENT_EVENT_LOG');
