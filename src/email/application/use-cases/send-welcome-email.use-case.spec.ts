import { EmailMessage, EmailSender } from '../ports/email-sender.port';
import { PublicAppUrl } from '../ports/public-app-url.port';
import { SendWelcomeEmailUseCase } from './send-welcome-email.use-case';

class FakeSender implements EmailSender {
  sent: EmailMessage[] = [];
  fail = false;
  send(message: EmailMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error('smtp down'));
    this.sent.push(message);
    return Promise.resolve();
  }
}

const url = (value: string | null): PublicAppUrl => ({ read: () => value });
const input = {
  to: 'ana@example.com',
  adminName: 'Ana <Dueña>',
  businessName: 'Barbería "Sur"',
};

describe('SendWelcomeEmailUseCase', () => {
  it('sends the welcome to the admin with the link of the panel of the business', async () => {
    const sender = new FakeSender();
    await new SendWelcomeEmailUseCase(
      sender,
      url('https://app.example.com/n/sur'),
    ).execute(input);

    expect(sender.sent).toHaveLength(1);
    const [message] = sender.sent;
    expect(message.to).toBe('ana@example.com');
    expect(message.subject).toBe('Bienvenido a BookingApp — Barbería "Sur"');
    expect(message.html).toContain(
      'href="https://app.example.com/n/sur/login"',
    );
    expect(message.html).toContain('Ana &lt;Dueña&gt;');
    expect(message.html).toContain('Barbería &quot;Sur&quot;');
  });

  it('leaves the button out when the public URL is unknown', async () => {
    const sender = new FakeSender();
    await new SendWelcomeEmailUseCase(sender, url(null)).execute(input);
    expect(sender.sent[0].html).not.toContain('<a ');
  });

  it('lets the failure of the sender reach the caller', async () => {
    const sender = new FakeSender();
    sender.fail = true;
    await expect(
      new SendWelcomeEmailUseCase(sender, url(null)).execute(input),
    ).rejects.toThrow('smtp down');
  });
});
