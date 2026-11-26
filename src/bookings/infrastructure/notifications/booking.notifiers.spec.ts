import { describe, expect, it, jest } from '@jest/globals';
import { Booking } from '../../domain/booking';
import {
  CompositeBookingNotifier,
  EmailBookingNotifier,
  SocketBookingNotifier,
} from './booking.notifiers';

const booking: Booking = {
  id: 'mem-1',
  client: { name: 'Juan Pérez', email: 'juan@example.com', phone: '123' },
  services: [{ id: 'corte', name: 'Corte', price: 1200, duration: 60 }],
  totalPrice: 1200,
  totalDuration: 60,
  professional: { id: 'ana', name: 'Ana' },
  location: { id: 'principal', name: 'Principal' },
  date: '2030-06-17',
  time: '10:00',
  slots: ['10:00'],
  notes: '',
  status: 'confirmed',
};

describe('the booking notifications', () => {
  it('gives the cancel token to the email and never the hash', async () => {
    const email = {
      sendBookingConfirmation: jest.fn(async () => undefined),
      sendCancellationConfirmation: jest.fn(async () => undefined),
    };
    await new EmailBookingNotifier(email).created(booking, 'the-token');

    expect(email.sendBookingConfirmation).toHaveBeenCalledWith(
      booking,
      'the-token',
    );
    expect(
      JSON.stringify(email.sendBookingConfirmation.mock.calls),
    ).not.toContain('hash');
  });

  it('does not email a client that left no email', async () => {
    const email = {
      sendBookingConfirmation: jest.fn(async () => undefined),
      sendCancellationConfirmation: jest.fn(async () => undefined),
    };
    const withoutEmail = {
      ...booking,
      client: { ...booking.client, email: undefined },
    };

    await new EmailBookingNotifier(email).created(withoutEmail, 'the-token');
    await new EmailBookingNotifier(email).cancelled(withoutEmail);

    expect(email.sendBookingConfirmation).not.toHaveBeenCalled();
    expect(email.sendCancellationConfirmation).not.toHaveBeenCalled();
  });

  it('tells the live panel about the new booking and about the cancellation', async () => {
    const gateway = {
      notifyNewBooking: jest.fn(),
      notifyBookingCancelled: jest.fn(),
    };
    const notifier = new SocketBookingNotifier(gateway);

    await notifier.created(booking);
    await notifier.cancelled(booking);

    expect(gateway.notifyNewBooking).toHaveBeenCalledWith(booking);
    expect(gateway.notifyBookingCancelled).toHaveBeenCalledWith(booking.id);
  });

  it('runs every notification and keeps going when one fails', async () => {
    const failing = {
      created: jest.fn(async () => {
        throw new Error('socket down');
      }),
      cancelled: jest.fn(async () => undefined),
    };
    const working = {
      created: jest.fn(async () => undefined),
      cancelled: jest.fn(async () => undefined),
    };

    await new CompositeBookingNotifier([failing, working]).created(
      booking,
      't',
    );

    expect(working.created).toHaveBeenCalledWith(booking, 't');
  });
});
