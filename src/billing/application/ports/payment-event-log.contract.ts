import { PaymentEventLog } from './payment-event-log.port';

const entry = (externalEventId = 'evt_1') => ({
  externalEventId,
  type: 'payment.succeeded',
  processedAt: new Date('2026-11-25T10:00:00.000Z'),
});

/** Behavior every PaymentEventLog adapter must honor (on an EMPTY log). */
export function describePaymentEventLogContract(
  name: string,
  factory: () => Promise<PaymentEventLog>,
): void {
  describe(`PaymentEventLog contract: ${name}`, () => {
    let log: PaymentEventLog;

    beforeEach(async () => {
      log = await factory();
    });

    it('does not know an event it never recorded', async () => {
      await expect(log.has('evt_1')).resolves.toBe(false);
    });

    it('records an event once: the first time stores it, the second does not', async () => {
      await expect(log.tryRecord(entry())).resolves.toBe(true);
      await expect(log.has('evt_1')).resolves.toBe(true);
      await expect(log.tryRecord(entry())).resolves.toBe(false);
    });

    it('keeps different events apart', async () => {
      await log.tryRecord(entry('evt_1'));
      await expect(log.has('evt_2')).resolves.toBe(false);
      await expect(log.tryRecord(entry('evt_2'))).resolves.toBe(true);
    });
  });
}
