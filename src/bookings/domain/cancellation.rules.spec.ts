import { SystemBusinessClock } from '../../availability/infrastructure/system-business-clock';
import { Booking } from './booking';
import {
  BookingNotFound,
  BusinessHoursUnverifiable,
  CancellationClosed,
} from './booking.errors';
import {
  BusinessInstant,
  CANCEL_TOKEN_LENGTH,
  cancelStateOf,
  cancelWindow,
  ensureCancellable,
  foundByToken,
  isCancelTokenShape,
  toCancellationSummary,
} from './cancellation.rules';

/** "Now" seen from a timezone, computed by the real business clock. */
function businessInstantAt(
  utc: string,
  zone: string | undefined,
): BusinessInstant {
  const saved = process.env.BUSINESS_TIMEZONE;
  if (zone === undefined) delete process.env.BUSINESS_TIMEZONE;
  else process.env.BUSINESS_TIMEZONE = zone;
  try {
    return new SystemBusinessClock({ now: () => new Date(utc) }).now();
  } finally {
    if (saved === undefined) delete process.env.BUSINESS_TIMEZONE;
    else process.env.BUSINESS_TIMEZONE = saved;
  }
}

describe('isCancelTokenShape', () => {
  it('accepts 43 base64url characters and nothing else', () => {
    expect(CANCEL_TOKEN_LENGTH).toBe(43);
    expect(isCancelTokenShape('a'.repeat(43))).toBe(true);
    expect(isCancelTokenShape('A_-9'.repeat(10) + 'abc')).toBe(true);
    expect(isCancelTokenShape('a'.repeat(42))).toBe(false);
    expect(isCancelTokenShape('a'.repeat(44))).toBe(false);
    expect(isCancelTokenShape('not-a-token')).toBe(false);
    expect(isCancelTokenShape('')).toBe(false);
    expect(isCancelTokenShape(undefined)).toBe(false);
    expect(isCancelTokenShape('a'.repeat(42) + '=')).toBe(false);
  });
});

describe('cancelWindow', () => {
  // Buenos Aires is UTC-3 all year: 10:00 local is 13:00 UTC.
  const ZONE = 'America/Argentina/Buenos_Aires';
  const window = (date: string, time: string, utc: string, zone = ZONE) =>
    cancelWindow(date, time, businessInstantAt(utc, zone));

  it('is open up to exactly 60 seconds before the start', () => {
    expect(window('2026-11-20', '10:00', '2026-11-20T12:59:00Z')).toBe('open');
  });

  it('is closed 59 seconds before the start', () => {
    expect(window('2026-11-20', '10:00', '2026-11-20T12:59:01Z')).toBe(
      'closed',
    );
  });

  it('is closed at the start and after it', () => {
    expect(window('2026-11-20', '10:00', '2026-11-20T13:00:00Z')).toBe(
      'closed',
    );
    expect(window('2026-11-20', '10:00', '2026-11-20T15:30:00Z')).toBe(
      'closed',
    );
  });

  it('is open on an earlier day and closed on a later day', () => {
    expect(window('2026-11-20', '09:00', '2026-11-19T23:59:59Z')).toBe('open');
    expect(window('2026-11-20', '09:00', '2026-11-21T12:00:00Z')).toBe(
      'closed',
    );
  });

  it('uses the business day, not the UTC day', () => {
    expect(window('2026-11-19', '23:00', '2026-11-20T01:30:00Z')).toBe('open');
    expect(window('2026-11-19', '23:00', '2026-11-20T02:30:00Z')).toBe(
      'closed',
    );
  });

  it('accepts a single digit hour', () => {
    expect(window('2026-11-20', '9:00', '2026-11-20T11:59:00Z')).toBe('open');
  });

  it('is unknown when the timezone is unset, blank or invalid', () => {
    const at = '2026-11-20T12:00:00Z';
    expect(
      cancelWindow('2026-11-20', '10:00', businessInstantAt(at, undefined)),
    ).toBe('unknown');
    expect(window('2026-11-20', '10:00', at, '  ')).toBe('unknown');
    expect(window('2026-11-20', '10:00', at, 'Not/AZone')).toBe('unknown');
  });

  it('fails closed on a malformed time', () => {
    const at = '2026-11-19T12:00:00Z';
    expect(window('2026-11-20', 'noon', at)).toBe('closed');
    expect(window('2026-11-20', '25:00', at)).toBe('closed');
    expect(window('2026-11-20', '', at)).toBe('closed');
  });
});

describe('cancelStateOf', () => {
  const booking = (status: Booking['status'], date = '2999-01-05') => ({
    status,
    date,
    time: '10:00',
  });
  const open: BusinessInstant = {
    today: '2026-01-01',
    time: '09:00',
    seconds: 0,
  };

  it('answers cancelled without needing the clock', () => {
    expect(
      cancelStateOf(booking('cancelled'), { today: 'x', time: null }),
    ).toEqual({
      ok: true,
      value: 'cancelled',
    });
  });

  it('answers cancellable or closed from the window', () => {
    expect(cancelStateOf(booking('confirmed'), open)).toEqual({
      ok: true,
      value: 'cancellable',
    });
    expect(cancelStateOf(booking('confirmed', '2000-01-01'), open)).toEqual({
      ok: true,
      value: 'closed',
    });
  });

  it('is an unavailable error when the timezone cannot be verified', () => {
    const result = cancelStateOf(booking('confirmed'), {
      today: 'x',
      time: null,
    });
    expect(!result.ok && result.error).toBeInstanceOf(
      BusinessHoursUnverifiable,
    );
    expect(!result.ok && result.error.kind).toBe('unavailable');
    expect(!result.ok && result.error.message).toBe(
      'No se puede verificar el horario del negocio. Intenta más tarde.',
    );
  });
});

describe('ensureCancellable, foundByToken and the summary', () => {
  it('refuses a closed window with the 409 message', () => {
    const result = ensureCancellable('closed');
    expect(!result.ok && result.error).toBeInstanceOf(CancellationClosed);
    expect(!result.ok && result.error.kind).toBe('conflict');
    expect(!result.ok && result.error.message).toBe(
      'Ya no es posible cancelar esta reserva',
    );
    expect(ensureCancellable('cancellable').ok).toBe(true);
    expect(ensureCancellable('cancelled').ok).toBe(true);
  });

  it('answers one not-found error for a missing booking', () => {
    const result = foundByToken(null);
    expect(!result.ok && result.error).toBeInstanceOf(BookingNotFound);
    expect(!result.ok && result.error.kind).toBe('not-found');
    expect(!result.ok && result.error.message).toBe('Reserva no encontrada');
  });

  it('shows no client data and no ids in the summary', () => {
    const booking: Booking = {
      id: 'secret-id',
      client: { name: 'Juan', email: 'j@x.com', phone: '555123' },
      services: [{ id: 's', name: 'Corte', price: 1, duration: 30 }],
      totalPrice: 1,
      totalDuration: 30,
      professional: { id: 'p', name: 'Alex' },
      date: '2999-01-05',
      time: '10:00',
      slots: ['10:00'],
      notes: '',
      status: 'confirmed',
    };

    const summary = toCancellationSummary(booking, 'cancellable');

    expect(summary).toEqual({
      state: 'cancellable',
      services: [{ name: 'Corte' }],
      professional: { name: 'Alex' },
      date: '2999-01-05',
      time: '10:00',
    });
    const text = JSON.stringify(summary);
    for (const hidden of ['Juan', 'j@x.com', '555123', 'secret-id']) {
      expect(text).not.toContain(hidden);
    }
  });
});
