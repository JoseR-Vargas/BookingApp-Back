import { MailerService } from '@nestjs-modules/mailer';
import { Booking } from '../bookings/schemas/booking.schema';
import { EmailService } from './email.service';

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
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const emailService = new EmailService({
    sendMail,
  } as unknown as MailerService);

  beforeEach(() => sendMail.mockClear());

  it('lists every service (escaped) and the total price in the email', async () => {
    await emailService.sendBookingConfirmation(booking);

    const { html } = sendMail.mock.calls[0][0];
    expect(html).toContain('Consulta Inicial');
    expect(html).toContain('Servicio &lt;Premium&gt;');
    expect(html).toContain(`$${(3000).toLocaleString('es-AR')}`);
  });

  it('names every service in the subject', async () => {
    await emailService.sendBookingConfirmation(booking);

    expect(sendMail.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        to: 'juan@example.com',
        subject:
          'Confirmación de reserva — Consulta Inicial, Servicio <Premium>',
      }),
    );
  });
});
