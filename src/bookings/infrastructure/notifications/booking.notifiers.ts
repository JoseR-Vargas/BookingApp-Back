// ===== AVISOS DE RESERVA =====
// The two notifications a booking triggers (live panel and confirmation email),
// behind one port. Every one of them is best effort: a failure is logged and never fails the
// booking, exactly as before the hexagonal migration.

import { Injectable, Logger } from '@nestjs/common';
import { Booking } from '../../domain/booking';
import { BookingNotifier } from '../../application/ports/booking-notifier.port';

/** Live panel: the admin list refreshes with the new booking. */
@Injectable()
export class SocketBookingNotifier implements BookingNotifier {
  constructor(
    private readonly gateway: {
      notifyNewBooking(booking: unknown): void;
      notifyBookingCancelled(id: string): void;
    },
  ) {}

  created(booking: Booking): Promise<void> {
    this.gateway.notifyNewBooking(booking);
    return Promise.resolve();
  }

  cancelled(booking: Booking): Promise<void> {
    this.gateway.notifyBookingCancelled(booking.id);
    return Promise.resolve();
  }
}

/** Confirmation email. Only clients that left an email get one. */
@Injectable()
export class EmailBookingNotifier implements BookingNotifier {
  constructor(
    private readonly email: {
      sendBookingConfirmation(
        booking: unknown,
        cancelToken: string,
      ): Promise<void>;
      sendCancellationConfirmation(booking: unknown): Promise<void>;
    },
  ) {}

  async created(booking: Booking, cancelToken: string): Promise<void> {
    if (!booking.client?.email) return;
    await this.email.sendBookingConfirmation(booking, cancelToken);
  }

  async cancelled(booking: Booking): Promise<void> {
    if (!booking.client?.email) return;
    await this.email.sendCancellationConfirmation(booking);
  }
}

/**
 * Every notification, one after the other. A failing one is logged and the others still run:
 * the booking was already created and must not be undone by a broken notification.
 */
@Injectable()
export class CompositeBookingNotifier implements BookingNotifier {
  private readonly logger = new Logger(CompositeBookingNotifier.name);

  constructor(readonly notifiers: BookingNotifier[]) {}

  async created(booking: Booking, cancelToken: string): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.created(booking, cancelToken);
      } catch (error) {
        this.logger.error(
          `Error al notificar la reserva creada (no crítico): ${error}`,
        );
      }
    }
  }

  async cancelled(booking: Booking): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.cancelled(booking);
      } catch (error) {
        this.logger.error(
          `Error al notificar la reserva cancelada (no crítico): ${error}`,
        );
      }
    }
  }
}
