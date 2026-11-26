import { describeMessageSenderContract } from '../../application/ports/message-sender.contract';
import { WhatsappClient } from '../../../whatsapp/whatsapp.client';
import { WhatsappConfig } from '../../../whatsapp/whatsapp.config';
import { WhatsappMessageSender } from './whatsapp-message-sender';

describe('WhatsappMessageSender', () => {
  const sent: { to: string; body: string }[] = [];
  let failing = false;
  let sendText: jest.Mock;
  let configured = true;
  let sender: WhatsappMessageSender;

  beforeEach(() => {
    sent.length = 0;
    failing = false;
    configured = true;
    sendText = jest.fn((to: string, body: string) => {
      if (failing) return Promise.reject(new Error('whatsapp down'));
      sent.push({ to, body });
      return Promise.resolve({ status: 'sent' as const, messageId: 'wamid.1' });
    });
    sender = new WhatsappMessageSender(
      { sendText } as unknown as WhatsappClient,
      {
        isSendingConfigured: () => configured,
      } as unknown as WhatsappConfig,
    );
  });

  describeMessageSenderContract('WhatsApp', () => ({
    sender,
    sent: () => sent,
    fail: () => {
      failing = true;
    },
  }));

  it('sends the text of the message to the phone', async () => {
    const result = await sender.send({
      to: '099123456',
      subject: 'Recordatorio de tu cita',
      body: 'Hola Ana',
    });

    expect(result.ok).toBe(true);
    expect(sendText).toHaveBeenCalledWith('099123456', 'Hola Ana');
  });

  it('skips the message when WhatsApp is not configured', async () => {
    configured = false;

    const result = await sender.send({
      to: '099123456',
      subject: 'Recordatorio',
      body: 'Hola Ana',
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('skips the message when the client reports that it is not configured', async () => {
    sendText.mockResolvedValue({ status: 'skipped', reason: 'not_configured' });

    const result = await sender.send({
      to: '099123456',
      subject: 'Recordatorio',
      body: 'Hola Ana',
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
  });
});
