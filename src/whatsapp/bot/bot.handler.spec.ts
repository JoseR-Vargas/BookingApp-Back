import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildDaySlots,
  dayOfWeekFromIsoDate,
  freeStartTimes,
  slotsRequired,
} from '../../availability/availability.calculator';
import { Availability } from '../../availability/availability.service';
import { SCHEDULE } from '../../catalog/catalog.config';
import { CatalogService } from '../../catalog/catalog.service';
import { InboundMessage } from '../whatsapp.types';
import { BotHandler } from './bot.handler';

const PHONE = '5491100000000';
const TZ = 'America/Argentina/Buenos_Aires';
// Monday 2026-10-26 10:00 in Buenos Aires (UTC-3).
const MONDAY_10AM = new Date('2026-10-26T13:00:00Z');

const text = (body: string, extra: Partial<InboundMessage> = {}) =>
  ({
    messageId: 'wamid.1',
    from: PHONE,
    timestamp: 1,
    type: 'text',
    text: body,
    profileName: 'Ana',
    ...extra,
  }) as InboundMessage;

const reply = (id: string, extra: Partial<InboundMessage> = {}) =>
  ({
    messageId: 'wamid.2',
    from: PHONE,
    timestamp: 1,
    type: 'interactive_reply',
    replyId: id,
    replyTitle: id,
    profileName: 'Ana',
    ...extra,
  }) as InboundMessage;

describe('BotHandler', () => {
  let handler: BotHandler;
  let store: Map<string, { step: string; data: Record<string, unknown> }>;
  let env: Record<string, string | undefined>;
  let errorLog: jest.SpyInstance;

  const client = {
    sendText: jest.fn(),
    sendInteractiveButtons: jest.fn(),
    sendInteractiveList: jest.fn(),
  };
  const states = {
    get: jest.fn((phone: string) => Promise.resolve(store.get(phone) ?? null)),
    save: jest.fn(
      (phone: string, step: string, data: Record<string, unknown> = {}) => {
        store.set(phone, { step, data });
        return Promise.resolve();
      },
    ),
    clear: jest.fn((phone: string) => {
      store.delete(phone);
      return Promise.resolve();
    }),
  };
  const bookings = { create: jest.fn() };

  /** Same output shape as AvailabilityService with no bookings at all. */
  const openAvailability = (
    date: string,
    serviceId: string,
  ): Promise<Availability | null> => {
    const catalog = new CatalogService();
    const service = catalog.findService(serviceId);
    if (!service) return Promise.resolve(null);
    const dayOfWeek = dayOfWeekFromIsoDate(date) as 0;
    const daySlots = buildDaySlots(dayOfWeek, SCHEDULE);
    const slots = freeStartTimes(
      daySlots,
      new Set(),
      slotsRequired(service.duration, SCHEDULE.slotIntervalMinutes),
      SCHEDULE.slotIntervalMinutes,
    );
    return Promise.resolve({
      date,
      closed: daySlots.length === 0,
      service: {
        id: service.id,
        name: service.name,
        duration: service.duration,
      },
      professionals: catalog
        .getProfessionalsForService(serviceId)
        .map((p) => ({ id: p.id, name: p.name, slots: [...slots] })),
    } satisfies Availability);
  };
  const availability = { getAvailability: jest.fn(openAvailability) };

  const lastCall = (mock: jest.Mock) =>
    mock.mock.calls[mock.mock.calls.length - 1] as unknown[];
  const rowIds = (call: unknown[]) =>
    (call[3] as { id: string }[]).map((row) => row.id);

  beforeEach(() => {
    jest.useFakeTimers({ now: MONDAY_10AM });
    jest.clearAllMocks();
    availability.getAvailability.mockImplementation(openAvailability);
    store = new Map();
    env = { BUSINESS_TIMEZONE: TZ };
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    handler = new BotHandler(
      client as never,
      states as never,
      new CatalogService(),
      availability as never,
      bookings as never,
      { get: (key: string) => env[key] } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const at = (step: string, data: Record<string, unknown>) =>
    store.set(PHONE, { step, data });

  describe('start and service list', () => {
    it.each(['hola', 'Hola!', 'MENU', 'inicio', 'Buenas tardes'])(
      'starts the flow on "%s" with the catalog services',
      async (greeting) => {
        await handler.handle(text(greeting));

        expect(store.get(PHONE)).toEqual({ step: 'choose_service', data: {} });
        const call = lastCall(client.sendInteractiveList);
        expect(call[0]).toBe(PHONE);
        expect(rowIds(call)).toEqual([
          'svc:consulta-inicial',
          'svc:servicio-basico',
          'svc:servicio-premium',
          'svc:sesion-expres',
        ]);
        expect((call[3] as { description: string }[])[1].description).toBe(
          '$1200 · 60 min',
        );
      },
    );

    it('starts the flow on any text when there is no conversation', async () => {
      await handler.handle(text('quiero un turno'));
      expect(store.get(PHONE)?.step).toBe('choose_service');
    });

    it('restarts from scratch on "menu" in the middle of the flow', async () => {
      at('confirm', { serviceId: 'servicio-basico', date: '2026-10-27' });
      await handler.handle(text('menu'));
      expect(store.get(PHONE)).toEqual({ step: 'choose_service', data: {} });
    });
  });

  describe('choose_service -> choose_day', () => {
    beforeEach(() => at('choose_service', {}));

    it('lists the next open days with free slots (Sunday is closed)', async () => {
      await handler.handle(reply('svc:servicio-basico'));

      expect(store.get(PHONE)).toEqual({
        step: 'choose_day',
        data: { serviceId: 'servicio-basico' },
      });
      // Mon 26 .. Sun Nov 1 = 7 calendar days, Sunday closed.
      expect(rowIds(lastCall(client.sendInteractiveList))).toEqual([
        'day:2026-10-26',
        'day:2026-10-27',
        'day:2026-10-28',
        'day:2026-10-29',
        'day:2026-10-30',
        'day:2026-10-31',
      ]);
      expect(
        (lastCall(client.sendInteractiveList)[3] as { title: string }[])[0]
          .title,
      ).toBe('Lunes 26/10');
    });

    it('drops today when business hours are already over (past filter)', async () => {
      jest.setSystemTime(new Date('2026-10-26T22:30:00Z')); // 19:30 local
      await handler.handle(reply('svc:servicio-basico'));
      expect(rowIds(lastCall(client.sendInteractiveList))[0]).toBe(
        'day:2026-10-27',
      );
    });

    it('apologizes and keeps the service list when no day has availability', async () => {
      availability.getAvailability.mockImplementation((date, serviceId) =>
        openAvailability(date, serviceId).then((a) =>
          a
            ? {
                ...a,
                professionals: a.professionals.map((p) => ({
                  ...p,
                  slots: [],
                })),
              }
            : a,
        ),
      );
      await handler.handle(reply('svc:servicio-basico'));

      expect(store.get(PHONE)).toEqual({ step: 'choose_service', data: {} });
      expect(lastCall(client.sendInteractiveList)[1]).toContain(
        'No hay horarios disponibles',
      );
    });

    it('re-sends the service list for an unknown service id', async () => {
      await handler.handle(reply('svc:inexistente'));
      expect(store.get(PHONE)).toEqual({ step: 'choose_service', data: {} });
      expect(rowIds(lastCall(client.sendInteractiveList))).toContain(
        'svc:servicio-basico',
      );
    });
  });

  describe('choose_day -> choose_time', () => {
    beforeEach(() => at('choose_day', { serviceId: 'servicio-basico' }));

    it('lists the union of free start times, hiding past hours for today', async () => {
      await handler.handle(reply('day:2026-10-26'));

      expect(store.get(PHONE)).toEqual({
        step: 'choose_time',
        data: { serviceId: 'servicio-basico', date: '2026-10-26' },
      });
      // Now is 10:00 local: 09:00 and 10:00 are gone, lunch (13:00) is skipped.
      expect(rowIds(lastCall(client.sendInteractiveList))).toEqual([
        'time:11:00',
        'time:12:00',
        'time:14:00',
        'time:15:00',
        'time:16:00',
        'time:17:00',
        'time:18:00',
        'time:19:00',
      ]);
    });

    it('merges slots of different professionals and caps the list at 10 rows', async () => {
      availability.getAvailability.mockResolvedValue({
        date: '2026-10-27',
        closed: false,
        service: { id: 'servicio-basico', name: 'x', duration: 60 },
        professionals: [
          {
            id: 'alex-garcia',
            name: 'Alex',
            slots: ['09:00', '11:00', '12:00'],
          },
          {
            id: 'maria-lopez',
            name: 'María',
            slots: [
              '10:00',
              '11:00',
              '14:00',
              '15:00',
              '16:00',
              '17:00',
              '18:00',
              '19:00',
            ],
          },
        ],
      });
      await handler.handle(reply('day:2026-10-27'));

      expect(rowIds(lastCall(client.sendInteractiveList))).toEqual([
        'time:09:00',
        'time:10:00',
        'time:11:00',
        'time:12:00',
        'time:14:00',
        'time:15:00',
        'time:16:00',
        'time:17:00',
        'time:18:00',
        'time:19:00',
      ]);
    });

    it.each(['day:2026-10-25', 'day:2026-11-02', 'day:nope', 'time:10:00'])(
      'ignores the out-of-window or wrong-step reply "%s" and re-sends the day list',
      async (id) => {
        await handler.handle(reply(id));
        expect(store.get(PHONE)?.step).toBe('choose_day');
        expect(rowIds(lastCall(client.sendInteractiveList))[0]).toMatch(
          /^day:/,
        );
      },
    );

    it('re-sends the day list on free text', async () => {
      await handler.handle(text('el martes'));
      expect(store.get(PHONE)?.step).toBe('choose_day');
      expect(rowIds(lastCall(client.sendInteractiveList))[0]).toMatch(/^day:/);
    });
  });

  describe('choose_time -> choose_professional', () => {
    beforeEach(() =>
      at('choose_time', { serviceId: 'servicio-basico', date: '2026-10-27' }),
    );

    it('offers only the professionals free at the chosen time', async () => {
      availability.getAvailability.mockResolvedValue({
        date: '2026-10-27',
        closed: false,
        service: { id: 'servicio-basico', name: 'x', duration: 60 },
        professionals: [
          { id: 'alex-garcia', name: 'Alex García', slots: ['11:00'] },
          { id: 'maria-lopez', name: 'María López', slots: ['10:00', '11:00'] },
        ],
      });
      await handler.handle(reply('time:10:00'));

      expect(store.get(PHONE)).toEqual({
        step: 'choose_professional',
        data: {
          serviceId: 'servicio-basico',
          date: '2026-10-27',
          time: '10:00',
        },
      });
      expect(lastCall(client.sendInteractiveButtons)[2]).toEqual([
        { id: 'pro:maria-lopez', title: 'María López' },
      ]);
    });

    it('goes back to the time list when nobody is free any more', async () => {
      availability.getAvailability.mockResolvedValue({
        date: '2026-10-27',
        closed: false,
        service: { id: 'servicio-basico', name: 'x', duration: 60 },
        professionals: [
          { id: 'alex-garcia', name: 'Alex García', slots: ['11:00'] },
          { id: 'maria-lopez', name: 'María López', slots: ['11:00'] },
        ],
      });
      await handler.handle(reply('time:10:00'));

      expect(store.get(PHONE)?.step).toBe('choose_time');
      expect(lastCall(client.sendInteractiveList)[1]).toContain(
        'ya no está disponible',
      );
    });

    it.each(['time:25:99', 'time:', 'svc:servicio-basico'])(
      'rejects the malformed or stale reply "%s"',
      async (id) => {
        await handler.handle(reply(id));
        expect(store.get(PHONE)?.step).toBe('choose_time');
        expect(client.sendInteractiveButtons).not.toHaveBeenCalled();
      },
    );
  });

  describe('choose_professional -> confirm', () => {
    const data = {
      serviceId: 'servicio-basico',
      date: '2026-10-27',
      time: '10:00',
    };
    beforeEach(() => at('choose_professional', data));

    it('shows a summary with Confirmar / Cancelar buttons', async () => {
      await handler.handle(reply('pro:alex-garcia'));

      expect(store.get(PHONE)).toEqual({
        step: 'confirm',
        data: { ...data, professionalId: 'alex-garcia' },
      });
      const call = lastCall(client.sendInteractiveButtons);
      expect(call[1]).toEqual(expect.stringContaining('Servicio Básico'));
      expect(call[1]).toEqual(expect.stringContaining('Martes 27/10'));
      expect(call[1]).toEqual(expect.stringContaining('10:00'));
      expect(call[1]).toEqual(expect.stringContaining('Alex García'));
      expect(call[1]).toEqual(expect.stringContaining('$1200'));
      expect(call[2]).toEqual([
        { id: 'confirm:yes', title: 'Confirmar' },
        { id: 'confirm:no', title: 'Cancelar' },
      ]);
    });

    it('returns to the time list if the professional was taken meanwhile', async () => {
      availability.getAvailability.mockImplementation((d, s) =>
        openAvailability(d, s).then((a) =>
          a
            ? {
                ...a,
                professionals: a.professionals.map((p) =>
                  p.id === 'alex-garcia' ? { ...p, slots: [] } : p,
                ),
              }
            : a,
        ),
      );
      await handler.handle(reply('pro:alex-garcia'));

      expect(store.get(PHONE)?.step).toBe('choose_time');
      expect(store.get(PHONE)?.data).toEqual({
        serviceId: 'servicio-basico',
        date: '2026-10-27',
      });
    });

    it('re-sends the professional prompt for an id that does not exist', async () => {
      await handler.handle(reply('pro:ghost'));
      expect(store.get(PHONE)).toEqual({ step: 'choose_professional', data });
      expect(lastCall(client.sendInteractiveButtons)[2]).toEqual([
        { id: 'pro:alex-garcia', title: 'Alex García' },
        { id: 'pro:maria-lopez', title: 'María López' },
      ]);
    });
  });

  describe('confirm', () => {
    const data = {
      serviceId: 'servicio-basico',
      date: '2026-10-27',
      time: '10:00',
      professionalId: 'alex-garcia',
    };
    beforeEach(() => at('confirm', data));

    it('creates the booking with the WhatsApp client, confirms and clears state', async () => {
      bookings.create.mockResolvedValue({});
      await handler.handle(reply('confirm:yes'));

      expect(bookings.create).toHaveBeenCalledWith({
        client: { name: 'Ana', phone: PHONE },
        service: {
          id: 'servicio-basico',
          name: 'Servicio Básico',
          price: 1200,
          duration: 60,
        },
        professional: { id: 'alex-garcia', name: 'Alex García' },
        date: '2026-10-27',
        time: '10:00',
      });
      expect(store.has(PHONE)).toBe(false);
      expect(lastCall(client.sendText)[1]).toContain('Reserva confirmada');
    });

    it('uses a default client name when WhatsApp gives no profile name', async () => {
      bookings.create.mockResolvedValue({});
      await handler.handle(reply('confirm:yes', { profileName: undefined }));
      expect(
        (bookings.create.mock.calls[0] as [{ client: { name: string } }])[0]
          .client.name,
      ).toBe('Cliente WhatsApp');
    });

    it('says goodbye and clears the state on "Cancelar"', async () => {
      await handler.handle(reply('confirm:no'));
      expect(bookings.create).not.toHaveBeenCalled();
      expect(store.has(PHONE)).toBe(false);
      expect(client.sendText).toHaveBeenCalledTimes(1);
    });

    it('apologizes and refreshes the time list on a booking conflict', async () => {
      bookings.create.mockRejectedValue(
        new Error(
          'Ya existe una reserva para Alex García el 2026-10-27 a las 10:00',
        ),
      );
      await handler.handle(reply('confirm:yes'));

      expect(store.get(PHONE)).toEqual({
        step: 'choose_time',
        data: { serviceId: 'servicio-basico', date: '2026-10-27' },
      });
      const call = lastCall(client.sendInteractiveList);
      expect(call[1]).toContain('acaba de ser reservado');
      expect(rowIds(call)[0]).toBe('time:09:00');
    });

    it('logs other errors, sends a generic apology and keeps the state', async () => {
      bookings.create.mockRejectedValue(new Error('Error de validación: boom'));
      await handler.handle(reply('confirm:yes'));

      expect(errorLog).toHaveBeenCalled();
      expect(lastCall(client.sendText)[1]).toContain('problema');
      expect(store.get(PHONE)).toEqual({ step: 'confirm', data });
    });

    it('re-sends the confirmation for unrelated input', async () => {
      await handler.handle(text('no sé'));
      expect(bookings.create).not.toHaveBeenCalled();
      expect(lastCall(client.sendInteractiveButtons)[2]).toHaveLength(2);
    });

    it('does not book from an incomplete conversation', async () => {
      at('confirm', { serviceId: 'servicio-basico' });
      await handler.handle(reply('confirm:yes'));
      expect(bookings.create).not.toHaveBeenCalled();
      expect(store.get(PHONE)).toEqual({ step: 'choose_service', data: {} });
    });
  });

  describe('free text and unsupported messages', () => {
    it('"cancelar" resets the conversation and says goodbye', async () => {
      at('choose_day', { serviceId: 'servicio-basico' });
      await handler.handle(text('Cancelar'));
      expect(store.has(PHONE)).toBe(false);
      expect(client.sendText).toHaveBeenCalledTimes(1);
    });

    it('answers images/audio with a short help text without touching state', async () => {
      at('choose_day', { serviceId: 'servicio-basico' });
      await handler.handle({
        messageId: 'w',
        from: PHONE,
        timestamp: 1,
        type: 'unsupported',
      });
      expect(lastCall(client.sendText)[1]).toContain('menu');
      expect(states.save).not.toHaveBeenCalled();
      expect(store.get(PHONE)?.step).toBe('choose_day');
    });

    it('starts over when an old button is tapped after the state expired', async () => {
      await handler.handle(reply('confirm:yes'));
      expect(bookings.create).not.toHaveBeenCalled();
      expect(store.get(PHONE)?.step).toBe('choose_service');
    });

    it('re-sends the current prompt when a stale reply arrives from another step', async () => {
      at('choose_time', { serviceId: 'servicio-basico', date: '2026-10-27' });
      await handler.handle(reply('confirm:yes'));
      expect(bookings.create).not.toHaveBeenCalled();
      expect(store.get(PHONE)).toEqual({
        step: 'choose_time',
        data: { serviceId: 'servicio-basico', date: '2026-10-27' },
      });
      expect(rowIds(lastCall(client.sendInteractiveList))[0]).toMatch(/^time:/);
    });
  });

  describe('BUSINESS_TIMEZONE not usable', () => {
    it.each([undefined, 'Not/AZone'])(
      'never books blind (timezone %p): logs an error and answers politely',
      async (timezone) => {
        env.BUSINESS_TIMEZONE = timezone;
        at('confirm', {
          serviceId: 'servicio-basico',
          date: '2026-10-27',
          time: '10:00',
          professionalId: 'alex-garcia',
        });
        await handler.handle(reply('confirm:yes'));

        expect(errorLog).toHaveBeenCalledTimes(1);
        expect(bookings.create).not.toHaveBeenCalled();
        expect(availability.getAvailability).not.toHaveBeenCalled();
        expect(states.save).not.toHaveBeenCalled();
        expect(lastCall(client.sendText)[1]).toContain('más tarde');
      },
    );
  });
});
