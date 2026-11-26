import {
  PaymentEventEntry,
  PaymentEventLog,
} from '../../../application/ports/payment-event-log.port';

/** Keeps the events in memory (global, like the collection: no business partition). */
export class InMemoryPaymentEventLog implements PaymentEventLog {
  private readonly entries = new Map<string, PaymentEventEntry>();

  has(externalEventId: string): Promise<boolean> {
    return Promise.resolve(this.entries.has(externalEventId));
  }

  tryRecord(entry: PaymentEventEntry): Promise<boolean> {
    if (this.entries.has(entry.externalEventId)) return Promise.resolve(false);
    this.entries.set(entry.externalEventId, { ...entry });
    return Promise.resolve(true);
  }
}
