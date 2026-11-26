// ===== CASO DE USO: ENVIAR UN RECORDATORIO =====
// Sends the reminder of one booking for one window (spec 24): it builds the
// text, sends it through every channel that applies and records what
// happened. A failure is an answer, not an exception: it is recorded and
// tried again in the next round, up to three times.

import { Inject, Injectable } from '@nestjs/common';
import { Booking } from '../../../bookings/domain/booking';
import {
  BOOKING_WRITER,
  BookingWriter,
} from '../../../bookings/application/ports/booking.writer';
import {
  CANCEL_TOKENS,
  CancelTokens,
} from '../../../bookings/application/ports/cancel-tokens.port';
import {
  PUBLIC_APP_URL,
  PublicAppUrl,
} from '../../../email/application/ports/public-app-url.port';
import {
  ReminderChannel,
  ReminderRecord,
  ReminderSettings,
} from '../../../shared/domain/reminders';
import { Result, ok } from '../../../shared/domain/result';
import {
  ReminderWindow,
  channelsForBooking,
  formatReminderDate,
  formatReminderTime,
  reminderAttempts,
  reminderState,
  renderReminderTemplate,
  upsertReminder,
} from '../../domain/reminder-rules';
import { BUSINESS_TIME, BusinessTime } from '../ports/business-time.port';
import { MESSAGE_SENDERS, MessageSenders } from '../ports/message-sender.port';

/** What the caller knows about the reminder it wants sent. */
export interface SendReminderInput {
  /** The booking to remind. */
  booking: Booking;
  /** The window it belongs to. */
  window: ReminderWindow;
  /** The settings of the business. */
  settings: ReminderSettings;
  /** The name the business shows in the message. */
  businessName: string;
  /**
   * The log of the booking as the caller knows it; the log of the booking
   * itself when it is absent. The caller keeps it up to date between the
   * windows of the same booking.
   */
  records?: ReminderRecord[];
}

/** What happened with one channel. */
export interface ReminderOutcome {
  /** The window it belongs to. */
  kind: string;
  /** The channel it went through. */
  channel: ReminderChannel;
  /** Whether it left. */
  ok: boolean;
  /** The channel is not configured: nothing was sent and nothing failed. */
  skipped: boolean;
  /** Why it did not leave, when it did not. */
  error?: string;
  /** How many times it was tried, the first one included. */
  attempts: number;
}

interface Sent {
  outcome: ReminderOutcome;
  /** The log of the booking with this reminder in it. */
  records: ReminderRecord[];
}

/** What the use case did with one booking. */
export interface SendReminderResult {
  /** What happened with every channel it used. */
  outcomes: ReminderOutcome[];
  /** The log of the booking with the reminders that were sent in it. */
  records: ReminderRecord[];
}

@Injectable()
export class SendReminderUseCase {
  constructor(
    @Inject(BOOKING_WRITER) private readonly writer: BookingWriter,
    @Inject(CANCEL_TOKENS) private readonly tokens: CancelTokens,
    @Inject(MESSAGE_SENDERS) private readonly senders: MessageSenders,
    @Inject(BUSINESS_TIME) private readonly time: BusinessTime,
    @Inject(PUBLIC_APP_URL) private readonly appUrl: PublicAppUrl,
  ) {}

  /**
   * Sends the reminder of the booking for the window through every channel
   * that applies. A window and a channel that already left are left alone,
   * and one that failed three times is given up.
   */
  async execute(input: SendReminderInput): Promise<Result<SendReminderResult>> {
    const { booking, window, settings, businessName } = input;
    const channels = channelsForBooking(booking.client, settings);
    const outcomes: ReminderOutcome[] = [];
    let records = input.records ?? booking.reminders ?? [];

    for (const channel of channels) {
      if (reminderState(records, window.kind, channel) !== 'pending') {
        continue;
      }
      const sent = await this.send(
        booking,
        window,
        channel,
        settings,
        businessName,
        records,
      );
      if (!sent.ok) return sent;
      outcomes.push(sent.value.outcome);
      records = sent.value.records;
    }

    return ok({ outcomes, records });
  }

  private async send(
    booking: Booking,
    window: ReminderWindow,
    channel: ReminderChannel,
    settings: ReminderSettings,
    businessName: string,
    records: ReminderRecord[],
  ): Promise<Result<Sent>> {
    const attempts = reminderAttempts(records, window.kind, channel) + 1;
    const token = this.tokens.generate();
    const tokenHash = this.tokens.hash(token);
    const body = renderReminderTemplate(settings.template, {
      cliente: booking.client.name,
      fecha: formatReminderDate(booking.date),
      hora: formatReminderTime(booking.time),
      profesional: booking.professional?.name ?? '',
      negocio: businessName,
      cancelar: this.cancelLink(token),
    });
    const subject = `Recordatorio de tu cita — ${businessName}`;
    const to = booking.client.email ?? '';

    const result = await this.senders[channel].send({ to, subject, body });
    const sentAt = this.time.now();

    if (result.skipped) {
      // The channel is not configured: nothing was sent and nothing failed,
      // so nothing is recorded and it is tried again in the next round.
      return ok({
        outcome: {
          kind: window.kind,
          channel,
          ok: false,
          skipped: true,
          error: result.error,
          attempts,
        },
        records,
      });
    }

    const record: ReminderRecord = {
      kind: window.kind,
      channel,
      sentAt,
      ok: result.ok,
      attempts,
      ...(result.ok
        ? {}
        : {
            error:
              result.error ??
              'No se pudo enviar el recordatorio por este canal.',
          }),
    };
    const next = upsertReminder(records, record);
    const saved = await this.writer.saveReminders(
      booking.id,
      next,
      result.ok ? tokenHash : undefined,
    );
    if (!saved.ok) return saved;

    return ok({
      outcome: {
        kind: window.kind,
        channel,
        ok: result.ok,
        skipped: false,
        error: record.error,
        attempts,
      },
      records: next,
    });
  }

  /** The link that cancels the booking, or an empty text when the app has no public URL. */
  private cancelLink(token: string): string {
    const base = this.appUrl.read();
    return base ? `${base}/cancelar/${token}` : '';
  }
}
