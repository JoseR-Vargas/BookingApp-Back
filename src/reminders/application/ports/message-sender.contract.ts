// ===== CONTRATO DEL ENVÍO DE MENSAJES =====
// What every sender of a reminder must honor, whichever provider is behind
// it: the message leaves and the provider answers, a failure is an answer
// and never an exception.

import { MessageSender } from './message-sender.port';

export interface MessageSenderFixture {
  /** The sender under test. */
  sender: MessageSender;
  /** The messages that reached the outside, with the text they carry. */
  sent(): { to: string; body: string }[];
  /** Makes the provider fail from now on. */
  fail(): void;
}

export function describeMessageSenderContract(
  name: string,
  factory: () => MessageSenderFixture | Promise<MessageSenderFixture>,
): void {
  describe(`MessageSender contract: ${name}`, () => {
    let fixture: MessageSenderFixture;

    beforeEach(async () => {
      fixture = await factory();
    });

    it('sends the message to the address and answers that it left', async () => {
      const result = await fixture.sender.send({
        to: '099123456',
        subject: 'Recordatorio de tu cita',
        body: 'Hola Ana',
      });

      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
      expect(fixture.sent()).toHaveLength(1);
      expect(fixture.sent()[0].to).toBe('099123456');
      expect(fixture.sent()[0].body).toContain('Hola Ana');
    });

    it('answers the failure of the provider instead of breaking', async () => {
      fixture.fail();

      const result = await fixture.sender.send({
        to: '099123456',
        subject: 'Recordatorio de tu cita',
        body: 'Hola Ana',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual(expect.any(String));
      expect(fixture.sent()).toHaveLength(0);
    });
  });
}
