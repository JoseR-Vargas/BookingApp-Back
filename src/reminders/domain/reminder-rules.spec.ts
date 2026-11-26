import {
  ReminderRecord,
  ReminderSettings,
} from '../../shared/domain/reminders';
import {
  channelsForBooking,
  formatReminderDate,
  formatReminderTime,
  isWindowDue,
  reminderAttempts,
  reminderKind,
  reminderState,
  reminderWindows,
  renderReminderTemplate,
  upsertReminder,
} from './reminder-rules';
import {
  defaultReminderSettings,
  mergeReminderSettings,
} from './reminder-settings';

const HOUR = 60 * 60 * 1000;

/** An appointment at 10:00 of 2026-03-25 (UTC instants; the timezone is the adapter's business). */
const START = new Date('2026-03-25T10:00:00Z');

const settings = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({
  ...defaultReminderSettings(),
  ...over,
});

const record = (over: Partial<ReminderRecord> = {}): ReminderRecord => ({
  kind: '24h',
  channel: 'whatsapp',
  sentAt: new Date('2026-03-24T10:00:00Z'),
  ok: true,
  attempts: 1,
  ...over,
});

describe('reminder windows', () => {
  it('reads the windows of a configuration from the farthest to the closest', () => {
    expect(reminderWindows([3, 24])).toEqual([
      { hoursBefore: 24, kind: '24h' },
      { hoursBefore: 3, kind: '3h' },
    ]);
  });

  it('leaves out repetitions and values that are not hours', () => {
    expect(reminderWindows([24, 24, 0, -3, Number.NaN])).toEqual([
      { hoursBefore: 24, kind: '24h' },
    ]);
  });

  it('has no window when the business asked for none', () => {
    expect(reminderWindows([])).toEqual([]);
  });

  it('names a window after its anticipation', () => {
    expect(reminderKind(24)).toBe('24h');
    expect(reminderKind(3)).toBe('3h');
  });
});

describe('isWindowDue', () => {
  it('is due once the window opens', () => {
    expect(isWindowDue(START, new Date(START.getTime() - 24 * HOUR), 24)).toBe(
      true,
    );
  });

  it('is not due before the window opens', () => {
    expect(isWindowDue(START, new Date(START.getTime() - 25 * HOUR), 24)).toBe(
      false,
    );
  });

  it('is due while the appointment has not started', () => {
    expect(isWindowDue(START, new Date(START.getTime() - HOUR), 24)).toBe(true);
    expect(
      isWindowDue(START, new Date(START.getTime() - 30 * 60 * 1000), 3),
    ).toBe(true);
  });

  it('never reminds a booking in the past', () => {
    expect(isWindowDue(START, START, 24)).toBe(false);
    expect(isWindowDue(START, new Date(START.getTime() + HOUR), 24)).toBe(
      false,
    );
  });
});

describe('the log of the booking', () => {
  it('is pending when nothing was sent for the window and the channel', () => {
    expect(reminderState([], '24h', 'whatsapp')).toBe('pending');
    expect(reminderState(undefined, '24h', 'whatsapp')).toBe('pending');
  });

  it('is sent once the reminder left', () => {
    expect(reminderState([record()], '24h', 'whatsapp')).toBe('sent');
  });

  it('is pending again while the attempts are left', () => {
    const failed = [record({ ok: false, error: 'smtp down', attempts: 1 })];

    expect(reminderState(failed, '24h', 'whatsapp')).toBe('pending');
    expect(reminderAttempts(failed, '24h', 'whatsapp')).toBe(1);
  });

  it('is given up after three attempts', () => {
    const failed = [record({ ok: false, error: 'smtp down', attempts: 3 })];

    expect(reminderState(failed, '24h', 'whatsapp')).toBe('exhausted');
  });

  it('keeps one entry per window and channel', () => {
    const first = record();
    const second = record({ sentAt: new Date('2026-03-25T10:00:00Z') });

    const log = upsertReminder(upsertReminder([], first), second);

    expect(log).toHaveLength(1);
    expect(log[0].sentAt).toEqual(new Date('2026-03-25T10:00:00Z'));
  });

  it('keeps the entries of the other windows and channels', () => {
    const log = upsertReminder(
      [record(), record({ kind: '3h' }), record({ channel: 'email' })],
      record({ ok: false, attempts: 2 }),
    );

    expect(log).toHaveLength(3);
    expect(log.filter((entry) => entry.kind === '24h')).toHaveLength(2);
  });
});

describe('the channels of a booking', () => {
  it('uses WhatsApp when the client left a phone', () => {
    expect(channelsForBooking({ phone: '099123456' }, settings())).toEqual([
      'whatsapp',
    ]);
  });

  it('uses email when the client left an email', () => {
    expect(
      channelsForBooking({ email: 'ana@example.com' }, settings()),
    ).toEqual(['email']);
  });

  it('uses both when the client left both', () => {
    expect(
      channelsForBooking(
        { phone: '099123456', email: 'ana@example.com' },
        settings(),
      ),
    ).toEqual(['whatsapp', 'email']);
  });

  it('uses none when the client left neither', () => {
    expect(channelsForBooking({}, settings())).toEqual([]);
    expect(channelsForBooking({ phone: '  ', email: '' }, settings())).toEqual(
      [],
    );
  });

  it('only uses the channels the business allows', () => {
    const onlyEmail = settings({ channels: ['email'] });

    expect(channelsForBooking({ phone: '099123456' }, onlyEmail)).toEqual([]);
    expect(
      channelsForBooking({ phone: '099123456', email: 'a@b.com' }, onlyEmail),
    ).toEqual(['email']);
  });

  it('uses none when the business allows no channel', () => {
    expect(
      channelsForBooking(
        { phone: '099123456', email: 'ana@example.com' },
        settings({ channels: [] }),
      ),
    ).toEqual([]);
  });
});

describe('the text of the message', () => {
  const data = {
    cliente: 'Ana',
    fecha: 'Miércoles, 25 de marzo de 2026',
    hora: '10:00',
    profesional: 'Beto',
    negocio: 'Barbería Sur',
    cancelar: 'https://app.example.com/cancelar/abc',
  };

  it('replaces every marker', () => {
    expect(
      renderReminderTemplate(
        'Hola {cliente}, {fecha} a las {hora} en {negocio} con {profesional}. {cancelar}',
        data,
      ),
    ).toBe(
      'Hola Ana, Miércoles, 25 de marzo de 2026 a las 10:00 en Barbería Sur con Beto. https://app.example.com/cancelar/abc',
    );
  });

  it('leaves the markers nobody knows as they are', () => {
    expect(renderReminderTemplate('Hola {cliente} {desconocido}', data)).toBe(
      'Hola Ana {desconocido}',
    );
  });

  it('writes the date of the appointment in Spanish', () => {
    expect(formatReminderDate('2026-03-25')).toBe(
      'Miércoles, 25 de marzo de 2026',
    );
  });

  it('writes the hour of the appointment', () => {
    expect(formatReminderTime('9:05')).toBe('09:05');
    expect(formatReminderTime('10:00')).toBe('10:00');
  });
});

describe('the settings of the business', () => {
  it('starts with both channels, 24 and 3 hours and a template that says everything', () => {
    const defaults = defaultReminderSettings();

    expect(defaults.enabled).toBe(true);
    expect(defaults.channels).toEqual(['whatsapp', 'email']);
    expect(defaults.hoursBefore).toEqual([24, 3]);
    expect(defaults.template).toContain('{cliente}');
    expect(defaults.template).toContain('{fecha}');
    expect(defaults.template).toContain('{hora}');
    expect(defaults.template).toContain('{profesional}');
    expect(defaults.template).toContain('{negocio}');
    expect(defaults.template).toContain('{cancelar}');
  });

  it('keeps the fields the owner did not send', () => {
    const current = settings({ hoursBefore: [12] });

    const merged = mergeReminderSettings(current, { enabled: false });

    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.value.enabled).toBe(false);
      expect(merged.value.hoursBefore).toEqual([12]);
    }
  });

  it('accepts the whole configuration at once', () => {
    const merged = mergeReminderSettings(defaultReminderSettings(), {
      enabled: true,
      channels: ['whatsapp'],
      hoursBefore: [48, 6],
      template: 'Hola {cliente}',
    });

    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.value).toEqual({
        enabled: true,
        channels: ['whatsapp'],
        hoursBefore: [48, 6],
        template: 'Hola {cliente}',
      });
    }
  });

  it('refuses a channel that does not exist', () => {
    const merged = mergeReminderSettings(defaultReminderSettings(), {
      channels: ['sms'],
    });

    expect(merged.ok).toBe(false);
    if (!merged.ok) {
      expect(merged.error.kind).toBe('validation');
      expect(merged.error.message).toContain('sms');
    }
  });

  it('refuses an anticipation that is not a number of hours', () => {
    const merged = mergeReminderSettings(defaultReminderSettings(), {
      hoursBefore: [0],
    });

    expect(merged.ok).toBe(false);
  });

  it('refuses an empty template', () => {
    const merged = mergeReminderSettings(defaultReminderSettings(), {
      template: '   ',
    });

    expect(merged.ok).toBe(false);
  });

  it('refuses a body that is not an object', () => {
    expect(mergeReminderSettings(defaultReminderSettings(), 'nope').ok).toBe(
      false,
    );
  });
});
