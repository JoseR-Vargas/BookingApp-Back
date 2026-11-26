import { buildReminders } from '../../reminders.testing';

describe('SendDueReminders', () => {
  it('sends the reminder of a booking whose window is open, through WhatsApp when the client left a phone', async () => {
    const r = buildReminders();
    await r.store({ client: { name: 'Ana', phone: '099123456' } });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ skipped: null, sent: 1, failed: 0 });
    }
    expect(r.whatsapp.sent).toHaveLength(1);
    expect(r.whatsapp.sent[0].to).toBe('099123456');
    expect(r.email.sent).toHaveLength(0);
  });

  it('sends it only once: the next round finds it already sent', async () => {
    const r = buildReminders();
    await r.store({ client: { name: 'Ana', phone: '099123456' } });

    await r.sendDue.execute();
    const second = await r.sendDue.execute();

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.sent).toBe(0);
    }
    expect(r.whatsapp.sent).toHaveLength(1);
  });

  it('never reminds a cancelled booking', async () => {
    const r = buildReminders();
    await r.store({
      client: { name: 'Ana', phone: '099123456' },
      status: 'cancelled',
    });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(0);
    expect(r.whatsapp.sent).toHaveLength(0);
  });

  it('never reminds a booking in the past', async () => {
    const r = buildReminders();
    await r.store({
      client: { name: 'Ana', phone: '099123456' },
      date: '2026-03-23',
      time: '10:00',
    });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(0);
    expect(r.whatsapp.sent).toHaveLength(0);
  });

  it('sends nothing when the business turned the reminders off', async () => {
    const r = buildReminders({ settings: { enabled: false } });
    await r.store({ client: { name: 'Ana', phone: '099123456' } });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ skipped: 'disabled', sent: 0, failed: 0 });
    }
    expect(r.whatsapp.sent).toHaveLength(0);
  });

  it('sends nothing when the plan of the business does not allow reminders', async () => {
    const r = buildReminders();
    r.plan.allowed = false;
    await r.store({ client: { name: 'Ana', phone: '099123456' } });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ skipped: 'plan', sent: 0, failed: 0 });
    }
    expect(r.whatsapp.sent).toHaveLength(0);
  });

  it('sends nothing to a client who left neither phone nor email', async () => {
    const r = buildReminders();
    await r.store({ client: { name: 'Ana', phone: '' } });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(0);
    expect(r.whatsapp.sent).toHaveLength(0);
    expect(r.email.sent).toHaveLength(0);
  });

  it('sends through both channels when the client left both', async () => {
    const r = buildReminders();
    await r.store({
      client: { name: 'Ana', phone: '099123456', email: 'ana@example.com' },
    });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(2);
    expect(r.whatsapp.sent).toHaveLength(1);
    expect(r.email.sent).toHaveLength(1);
    expect(r.email.sent[0].to).toBe('ana@example.com');
  });

  it('sends the second window when it opens, and the first one only once', async () => {
    const r = buildReminders({ now: new Date('2026-03-25T12:00:00Z') });
    await r.store({ client: { name: 'Ana', phone: '099123456' } });

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(2);
    expect(r.whatsapp.sent).toHaveLength(2);
    const booking = (await r.bookings.findAll())[0];
    expect(booking.reminders?.map((entry) => entry.kind).sort()).toEqual([
      '24h',
      '3h',
    ]);
  });

  it('the message carries the business, the date, the hour, the professional and the link to cancel', async () => {
    const r = buildReminders();
    await r.store({ client: { name: 'Ana', phone: '099123456' } });

    await r.sendDue.execute();

    const [message] = r.whatsapp.sent;
    expect(message.body).toContain('Ana');
    expect(message.body).toContain('Barbería Sur');
    expect(message.body).toContain('Miércoles, 25 de marzo de 2026');
    expect(message.body).toContain('10:00');
    expect(message.body).toContain('Beto');
    expect(message.body).toContain('https://app.example.com/cancelar/');
  });

  it('the link of the reminder cancels that booking and only that one', async () => {
    const r = buildReminders();
    const reminded = await r.store({
      client: { name: 'Ana', phone: '099123456' },
    });
    const other = await r.store({
      client: { name: 'Beto', phone: '099999999' },
      professional: { id: 'beto', name: 'Carla' },
      slots: ['12:00'],
      time: '12:00',
    });

    await r.sendDue.execute();

    const token = /cancelar\/([A-Za-z0-9_-]+)/.exec(
      r.whatsapp.sent[0].body,
    )?.[1];
    expect(token).toBeTruthy();
    const found = await r.bookings.findByCancelTokenHash(
      r.tokens.hash(token as string),
    );
    expect(found?.id).toBe(reminded.id);
    expect(found?.id).not.toBe(other.id);
  });

  it('records a failed send and tries it again in the next round, up to three times', async () => {
    const r = buildReminders();
    await r.store({ client: { name: 'Ana', phone: '099123456' } });
    r.whatsapp.failWith = 'whatsapp down';

    const first = await r.sendDue.execute();
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value).toEqual({ skipped: null, sent: 0, failed: 1 });
    }

    await r.sendDue.execute();
    await r.sendDue.execute();

    const booking = (await r.bookings.findAll())[0];
    expect(booking.reminders).toEqual([
      expect.objectContaining({
        kind: '24h',
        channel: 'whatsapp',
        ok: false,
        error: 'whatsapp down',
        attempts: 3,
      }),
    ]);

    const fourth = await r.sendDue.execute();
    expect(fourth.ok).toBe(true);
    if (fourth.ok) {
      expect(fourth.value).toEqual({ skipped: null, sent: 0, failed: 0 });
    }
    const after = (await r.bookings.findAll())[0];
    expect(after.reminders?.[0].attempts).toBe(3);
  });

  it('records nothing when the channel is not configured', async () => {
    const r = buildReminders();
    await r.store({ client: { name: 'Ana', phone: '099123456' } });
    r.whatsapp.notConfigured = true;

    const result = await r.sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ skipped: null, sent: 0, failed: 0 });
    }
    const booking = (await r.bookings.findAll())[0];
    expect(booking.reminders).toBeUndefined();
  });
});

describe('GetReminderSettings', () => {
  it('answers the configuration of the business, its plan and the counters', async () => {
    const r = buildReminders();

    const result = await r.settings.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config).toEqual({
        enabled: true,
        channels: ['whatsapp', 'email'],
        hoursBefore: [24, 3],
        template: expect.any(String) as unknown as string,
      });
      expect(result.value.allowsReminders).toBe(true);
      expect(result.value.counters).toEqual({ days: 30, sent: 0, failed: 0 });
      expect(result.value.recent).toEqual([]);
    }
  });

  it('counts the reminders that left and the ones that failed, and lists the last ones', async () => {
    const r = buildReminders();
    await r.store({ client: { name: 'Ana', phone: '099123456' } });
    await r.sendDue.execute();
    r.email.failWith = 'smtp down';
    await r.store({
      client: { name: 'Beto', phone: '099999999', email: 'beto@example.com' },
      professional: { id: 'beto', name: 'Carla' },
      slots: ['10:30'],
      time: '10:30',
    });
    await r.sendDue.execute();

    const result = await r.settings.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counters.sent).toBe(2);
      expect(result.value.counters.failed).toBe(1);
      expect(result.value.recent).toHaveLength(3);
      expect(result.value.recent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: '24h',
            channel: 'email',
            ok: false,
            error: 'smtp down',
            attempts: 1,
          }),
        ]),
      );
    }
  });
});

describe('SaveReminderSettings', () => {
  it('saves the configuration the owner sent', async () => {
    const r = buildReminders();

    const result = await r.save.execute({
      enabled: true,
      channels: ['whatsapp'],
      hoursBefore: [12],
      template: 'Hola {cliente}',
    });

    expect(result.ok).toBe(true);
    expect(r.tenant.settings).toEqual({
      enabled: true,
      channels: ['whatsapp'],
      hoursBefore: [12],
      template: 'Hola {cliente}',
    });
  });

  it('refuses a configuration that is not valid and keeps the current one', async () => {
    const r = buildReminders();

    const result = await r.save.execute({ channels: ['sms'] });

    expect(result.ok).toBe(false);
    expect(r.tenant.settings.channels).toEqual(['whatsapp', 'email']);
  });
});
