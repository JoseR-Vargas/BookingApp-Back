import { Booking } from '../bookings/domain/booking';
import { EmailService } from './email.service';
import { SendBookingConfirmationUseCase } from './application/use-cases/send-booking-confirmation.use-case';
import { SendCancellationConfirmationUseCase } from './application/use-cases/send-cancellation-confirmation.use-case';
import { EnvPublicAppUrl } from './infrastructure/env-public-app-url';

const booking = {
  client: { name: 'Juan Pérez', email: 'juan@example.com', phone: '123' },
  services: [
    {
      id: 'consulta-inicial',
      name: 'Consulta Inicial',
      price: 500,
      duration: 30,
    },
    {
      id: 'servicio-premium',
      name: 'Servicio <Premium>',
      price: 2500,
      duration: 90,
    },
  ],
  totalPrice: 3000,
  totalDuration: 120,
  professional: { id: 'alex-garcia', name: 'Alex García' },
  date: '2026-03-25',
  time: '10:00',
  notes: '',
} as unknown as Booking;

describe('EmailService', () => {
  // The transport is a port now: the fake records the messages that leave.
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const sender = { send: sendMail };
  const appUrl = new EnvPublicAppUrl();
  const emailService = new EmailService(
    { sendMail } as never,
    new SendBookingConfirmationUseCase(sender, appUrl),
    new SendCancellationConfirmationUseCase(sender, appUrl),
  );

  beforeEach(() => sendMail.mockClear());

  it('lists every service (escaped) and the total price in the email', async () => {
    await emailService.sendBookingConfirmation(booking);

    const [{ html }] = sendMail.mock.calls[0] as [{ html: string }];
    expect(html).toContain('Consulta Inicial');
    expect(html).toContain('Servicio &lt;Premium&gt;');
    expect(html).toContain(`$${(3000).toLocaleString('es-AR')}`);
  });

  it('names every service in the subject', async () => {
    await emailService.sendBookingConfirmation(booking);

    expect((sendMail.mock.calls[0] as unknown[])[0]).toEqual(
      expect.objectContaining({
        to: 'juan@example.com',
        subject:
          'Confirmación de reserva — Consulta Inicial, Servicio <Premium>',
      }),
    );
  });
  describe('cancel link in the confirmation email', () => {
    const TOKEN = 'T'.repeat(43);
    const saved = process.env.PUBLIC_APP_URL;
    const htmlOfLastMail = () =>
      (sendMail.mock.calls[0] as [{ html: string }])[0].html;

    afterEach(() => {
      if (saved === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = saved;
    });

    it('links to /cancelar/<token> and states the one-minute rule', async () => {
      process.env.PUBLIC_APP_URL = 'https://app.example.com';

      await emailService.sendBookingConfirmation(booking, TOKEN);

      const html = htmlOfLastMail();
      expect(html).toContain(
        `href="https://app.example.com/cancelar/${TOKEN}"`,
      );
      expect(html).toContain('1 minuto');
      expect(html).not.toContain('5 horas');
    });

    it('does not double the slash of a base URL that ends with one', async () => {
      process.env.PUBLIC_APP_URL = 'https://app.example.com/';

      await emailService.sendBookingConfirmation(booking, TOKEN);

      expect(htmlOfLastMail()).toContain(
        `href="https://app.example.com/cancelar/${TOKEN}"`,
      );
    });

    it.each([
      ['PUBLIC_APP_URL is unset', undefined, TOKEN],
      ['PUBLIC_APP_URL is blank', '  ', TOKEN],
      ['PUBLIC_APP_URL is not http(s)', 'javascript:alert(1)', TOKEN],
      ['there is no token', 'https://app.example.com', undefined],
    ])(
      'omits the cancel block and its sentence when %s',
      async (_case, url, token) => {
        if (url === undefined) delete process.env.PUBLIC_APP_URL;
        else process.env.PUBLIC_APP_URL = url;

        await emailService.sendBookingConfirmation(booking, token);

        const html = htmlOfLastMail();
        expect(html).not.toContain('/cancelar/');
        expect(html).not.toContain('Cancelar mi reserva');
        expect(html).not.toContain('5 horas');
        expect(html).not.toContain('1 minuto');
        expect(html).toContain('Consulta Inicial');
      },
    );
  });

  describe('sendCancellationConfirmation', () => {
    const saved = process.env.PUBLIC_APP_URL;
    afterEach(() => {
      if (saved === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = saved;
    });

    it('tells the client the booking was cancelled, with its details escaped', async () => {
      delete process.env.PUBLIC_APP_URL;

      await emailService.sendCancellationConfirmation(booking);

      const [mail] = sendMail.mock.calls[0] as [
        { to: string; subject: string; html: string },
      ];
      expect(mail.to).toBe('juan@example.com');
      expect(mail.subject).toBe(
        'Reserva cancelada — Consulta Inicial, Servicio <Premium>',
      );
      expect(mail.html).toContain('Reserva cancelada');
      expect(mail.html).toContain('Servicio &lt;Premium&gt;');
      expect(mail.html).toContain('Alex García');
      expect(mail.html).toContain('10:00');
      expect(mail.html).not.toContain('Reservar de nuevo');
    });

    it('offers to book again when the app URL is known', async () => {
      process.env.PUBLIC_APP_URL = 'https://app.example.com/';

      await emailService.sendCancellationConfirmation(booking);

      expect((sendMail.mock.calls[0] as [{ html: string }])[0].html).toContain(
        'href="https://app.example.com"',
      );
      expect((sendMail.mock.calls[0] as [{ html: string }])[0].html).toContain(
        'Reservar de nuevo',
      );
    });
  });
});
