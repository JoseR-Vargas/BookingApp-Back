import { BadRequestException } from '@nestjs/common';
import {
  parsePublicAvailability,
  parseStartInterval,
  parseWeeklySchedule,
} from './catalog-validation';

const rejects = (fn: () => unknown, message: string | RegExp) => {
  expect(fn).toThrow(BadRequestException);
  expect(fn).toThrow(message);
};

const validWeekly = () => ({
  0: { closed: true },
  1: { closed: false, open: '09:00', close: '20:00' },
  2: { closed: false, open: '09:30', close: '18:30' },
  3: { closed: false, open: '00:00', close: '23:30' },
  4: { closed: false, open: '10:00', close: '10:30' },
  5: { closed: false, open: '09:00', close: '20:00' },
  6: { closed: true },
});

describe('parseWeeklySchedule', () => {
  it('normalises a valid week (closed days drop open/close)', () => {
    const weekly = parseWeeklySchedule({
      weekly: { ...validWeekly(), 0: { closed: true, open: '09:00' } },
    });

    expect(weekly[0]).toEqual({ closed: true });
    expect(weekly[2]).toEqual({
      closed: false,
      open: '09:30',
      close: '18:30',
    });
    expect(weekly[3]).toEqual({
      closed: false,
      open: '00:00',
      close: '23:30',
    });
    expect(Object.keys(weekly)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
  });

  describe('starts per day', () => {
    const LIST =
      'Las horas de inicio de cada día deben ser una lista sin repetidos de horas HH:mm.';
    const RANGE =
      'Las horas de inicio deben estar dentro del horario del día y ser múltiplos de 30 minutos.';
    const withStarts = (starts: unknown) => ({
      weekly: {
        ...validWeekly(),
        2: { closed: false, open: '09:30', close: '18:30', starts },
      },
    });

    it('keeps the starts of an open day, sorted', () => {
      expect(
        parseWeeklySchedule(withStarts(['15:00', '09:30', '12:00']))[2],
      ).toEqual({
        closed: false,
        open: '09:30',
        close: '18:30',
        starts: ['09:30', '12:00', '15:00'],
      });
    });

    it('has no starts key when the day sends none (or null)', () => {
      expect(parseWeeklySchedule(withStarts(undefined))[2]).not.toHaveProperty(
        'starts',
      );
      expect(parseWeeklySchedule(withStarts(null))[2]).not.toHaveProperty(
        'starts',
      );
    });

    it('drops the starts of a closed day', () => {
      const weekly = parseWeeklySchedule({
        weekly: { ...validWeekly(), 0: { closed: true, starts: ['10:00'] } },
      });
      expect(weekly[0]).toEqual({ closed: true });
    });

    it.each([
      ['an empty list', []],
      ['a non-list', '10:00'],
      ['a non-string item', [1000]],
      ['a badly formatted time', ['9am']],
      ['repeated times', ['10:00', '10:00']],
    ])('rejects %s', (_name, starts) => {
      rejects(() => parseWeeklySchedule(withStarts(starts)), LIST);
    });

    it.each([
      ['off the 30-minute grid', ['10:15']],
      ['before opening', ['09:00']],
      ['at or after closing', ['18:30']],
    ])('rejects a start %s', (_name, starts) => {
      rejects(() => parseWeeklySchedule(withStarts(starts)), RANGE);
    });
  });

  it('ignores slotIntervalMinutes and extra keys', () => {
    expect(
      parseWeeklySchedule({
        weekly: { ...validWeekly(), 7: { closed: true } },
        slotIntervalMinutes: 15,
      }),
    ).toEqual(parseWeeklySchedule({ weekly: validWeekly() }));
  });

  it('rejects a body without weekly', () => {
    rejects(() => parseWeeklySchedule({}), /weekly is required/);
    rejects(() => parseWeeklySchedule(null), /body must be a JSON object/);
    rejects(
      () => parseWeeklySchedule({ weekly: [] }),
      /weekly must be an object/,
    );
  });

  it.each([0, 3, 6])('rejects a missing day %i', (day) => {
    const weekly: Record<string, unknown> = validWeekly();
    delete weekly[day];
    rejects(
      () => parseWeeklySchedule({ weekly }),
      new RegExp(`day ${day} is required`),
    );
  });

  it.each([
    ['open equal to close', { closed: false, open: '10:00', close: '10:00' }],
    ['open after close', { closed: false, open: '12:00', close: '10:00' }],
  ])('rejects %s', (_label, day) => {
    rejects(
      () => parseWeeklySchedule({ weekly: { ...validWeekly(), 2: day } }),
      /day 2: open must be earlier than close/,
    );
  });

  it.each([
    [
      'minutes other than 00 and 30',
      { closed: false, open: '09:15', close: '18:00' },
    ],
    [
      'close with odd minutes',
      { closed: false, open: '09:00', close: '18:45' },
    ],
    ['a single-digit hour', { closed: false, open: '9:00', close: '18:00' }],
    ['hour 24', { closed: false, open: '09:00', close: '24:00' }],
    ['a non-string time', { closed: false, open: 9, close: 18 }],
    ['a missing close', { closed: false, open: '09:00' }],
    [
      'a time with seconds',
      { closed: false, open: '09:00:00', close: '18:00' },
    ],
  ])('rejects %s', (_label, day) => {
    rejects(
      () => parseWeeklySchedule({ weekly: { ...validWeekly(), 4: day } }),
      /day 4: (open|close) must be an HH:mm time/,
    );
  });

  it('rejects a day without a boolean closed flag', () => {
    rejects(
      () =>
        parseWeeklySchedule({
          weekly: { ...validWeekly(), 1: { open: '09:00', close: '18:00' } },
        }),
      /day 1: closed must be a boolean/,
    );
    rejects(
      () => parseWeeklySchedule({ weekly: { ...validWeekly(), 1: 'open' } }),
      /day 1 must be an object/,
    );
  });

  describe('parseStartInterval', () => {
    const MESSAGE =
      'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.';

    it('returns undefined when the field is absent', () => {
      expect(parseStartInterval({ weekly: validWeekly() })).toBeUndefined();
      expect(parseStartInterval({ startIntervalMinutes: undefined })).toBe(
        undefined,
      );
    });

    it.each([30, 60, 180, 480])('accepts %p', (value) => {
      expect(parseStartInterval({ startIntervalMinutes: value })).toBe(value);
    });

    it.each([
      45,
      0,
      500,
      510,
      -30,
      1.5,
      30.5,
      NaN,
      Infinity,
      'abc',
      '60',
      null,
      true,
      [],
    ])('rejects %p with the exact message', (value) => {
      let error: unknown;
      try {
        parseStartInterval({ startIntervalMinutes: value });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(MESSAGE);
    });
  });
});

describe('parsePublicAvailability', () => {
  const BOOL = 'El estado de la página pública debe ser verdadero o falso.';
  const DAYS = 'La cantidad de días debe ser un entero entre 1 y 14.';
  const SERVICES =
    'Los servicios publicados deben ser null (todos) o una lista sin repetidos con al menos un servicio.';

  it('accepts enabled, days and serviceIds (null = all)', () => {
    expect(
      parsePublicAvailability({ enabled: true, days: 7, serviceIds: null }),
    ).toEqual({ enabled: true, days: 7, serviceIds: null });
    expect(
      parsePublicAvailability({
        enabled: false,
        days: 14,
        serviceIds: ['a', 'b'],
      }),
    ).toEqual({ enabled: false, days: 14, serviceIds: ['a', 'b'] });
  });

  it.each([undefined, 'true', 1, null])('rejects enabled %p', (enabled) => {
    rejects(
      () => parsePublicAvailability({ enabled, days: 7, serviceIds: null }),
      BOOL,
    );
  });

  it.each([undefined, 0, 15, 1.5, '7', null, -1])('rejects days %p', (days) => {
    rejects(
      () => parsePublicAvailability({ enabled: true, days, serviceIds: null }),
      DAYS,
    );
  });

  it.each([undefined, [], 'a', ['a', 'a'], [1], ['']])(
    'rejects serviceIds %p',
    (serviceIds) => {
      rejects(
        () => parsePublicAvailability({ enabled: true, days: 7, serviceIds }),
        SERVICES,
      );
    },
  );
});
