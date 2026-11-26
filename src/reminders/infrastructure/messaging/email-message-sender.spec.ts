import {
  EmailMessage,
  EmailSender,
} from '../../../email/application/ports/email-sender.port';
import { describeMessageSenderContract } from '../../application/ports/message-sender.contract';
import { EmailMessageSender } from './email-message-sender';

describe('EmailMessageSender', () => {
  const sent: EmailMessage[] = [];
  let failing = false;
  let sender: EmailMessageSender;
  const originalFrom = process.env.MAIL_FROM;

  beforeEach(() => {
    sent.length = 0;
    failing = false;
    process.env.MAIL_FROM = 'no-reply@example.com';
    const mailer: EmailSender = {
      send: (message: EmailMessage) => {
        if (failing) return Promise.reject(new Error('smtp down'));
        sent.push(message);
        return Promise.resolve();
      },
    };
    sender = new EmailMessageSender(mailer);
  });

  afterEach(() => {
    if (originalFrom === undefined) {
      delete process.env.MAIL_FROM;
    } else {
      process.env.MAIL_FROM = originalFrom;
    }
  });

  describeMessageSenderContract('email', () => ({
    sender,
    sent: () => sent.map((message) => ({ to: message.to, body: message.html })),
    fail: () => {
      failing = true;
    },
  }));

  it('sends the message with its subject', async () => {
    const result = await sender.send({
      to: 'ana@example.com',
      subject: 'Recordatorio de tu cita — Barbería Sur',
      body: 'Hola Ana',
    });

    expect(result.ok).toBe(true);
    expect(sent[0]).toMatchObject({
      to: 'ana@example.com',
      subject: 'Recordatorio de tu cita — Barbería Sur',
    });
    expect(sent[0].html).toContain('Hola Ana');
  });

  it('escapes the text of the message', async () => {
    await sender.send({
      to: 'ana@example.com',
      subject: 'Recordatorio',
      body: 'Hola <b>Ana</b>',
    });

    expect(sent[0].html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;');
    expect(sent[0].html).not.toContain('<b>Ana</b>');
  });

  it('skips the message when the mailer is not configured', async () => {
    delete process.env.MAIL_FROM;
    delete process.env.GMAIL_USER;

    const result = await sender.send({
      to: 'ana@example.com',
      subject: 'Recordatorio',
      body: 'Hola Ana',
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(sent).toHaveLength(0);
  });
});
