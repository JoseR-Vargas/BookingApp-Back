import { DomainError } from '../../shared/domain/domain-error';
import { Result } from '../../shared/domain/result';
import { InvalidSchedule } from './location.errors';
import {
  parseStartInterval,
  parseWeeklySchedule,
  validateScheduleInput,
} from './schedule-input.rules';

/** A rejected result: a validation `InvalidSchedule` with exactly that message. */
const rejects = (result: Result<unknown>, message: string | RegExp) => {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBeInstanceOf(InvalidSchedule);
  expect(result.error).toBeInstanceOf(DomainError);
  expect(result.error.kind).toBe('validation');
  if (typeof message === 'string') expect(result.error.message).toBe(message);
  else expect(result.error.message).toMatch(message);
};

const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(`expected Ok, got ${result.error.message}`);
  return result.value;
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
    const weekly = valueOf(
      parseWeeklySchedule({
        weekly: { ...validWeekly(), 0: { closed: true, open: '09:00' } },
      }),
    );

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
        valueOf(
          parseWeeklySchedule(withStarts(['15:00', '09:30', '12:00'])),
        )[2],
      ).toEqual({
        closed: false,
        open: '09:30',
        close: '18:30',
        starts: ['09:30', '12:00', '15:00'],
      });
    });

    it('has no starts key when the day sends none (or null)', () => {
      expect(
        valueOf(parseWeeklySchedule(withStarts(undefined)))[2],
      ).not.toHaveProperty('starts');
      expect(
        valueOf(parseWeeklySchedule(withStarts(null)))[2],
      ).not.toHaveProperty('starts');
    });

    it('drops the starts of a closed day', () => {
      const weekly = valueOf(
        parseWeeklySchedule({
          weekly: { ...validWeekly(), 0: { closed: true, starts: ['10:00'] } },
        }),
      );
      expect(weekly[0]).toEqual({ closed: true });
    });

    it.each([
      ['an empty list', []],
      ['a non-list', '10:00'],
      ['a non-string item', [1000]],
      ['a badly formatted time', ['9am']],
      ['repeated times', ['10:00', '10:00']],
    ])('rejects %s', (_name, starts) => {
      rejects(parseWeeklySchedule(withStarts(starts)), LIST);
    });

    it.each([
      ['off the 30-minute grid', ['10:15']],
      ['before opening', ['09:00']],
      ['at or after closing', ['18:30']],
    ])('rejects a start %s', (_name, starts) => {
      rejects(parseWeeklySchedule(withStarts(starts)), RANGE);
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
    rejects(parseWeeklySchedule({}), 'weekly is required');
    rejects(parseWeeklySchedule(null), 'body must be a JSON object');
    rejects(parseWeeklySchedule([]), 'body must be a JSON object');
    rejects(
      parseWeeklySchedule({ weekly: [] }),
      'weekly must be an object keyed by day of week (0-6)',
    );
    rejects(
      parseWeeklySchedule({ weekly: null }),
      'weekly must be an object keyed by day of week (0-6)',
    );
  });

  it.each([0, 3, 6])('rejects a missing day %i', (day) => {
    const weekly: Record<string, unknown> = validWeekly();
    delete weekly[day];
    rejects(parseWeeklySchedule({ weekly }), `day ${day} is required`);
  });

  it('stops at the first broken day, in day order', () => {
    const weekly: Record<string, unknown> = {
      ...validWeekly(),
      1: 'open',
    };
    delete weekly[3];
    rejects(parseWeeklySchedule({ weekly }), 'day 1 must be an object');
  });

  it.each([
    ['open equal to close', { closed: false, open: '10:00', close: '10:00' }],
    ['open after close', { closed: false, open: '12:00', close: '10:00' }],
  ])('rejects %s', (_label, day) => {
    rejects(
      parseWeeklySchedule({ weekly: { ...validWeekly(), 2: day } }),
      'day 2: open must be earlier than close',
    );
  });

  it.each([
    [
      'minutes other than 00 and 30',
      { closed: false, open: '09:15', close: '18:00' },
      'open',
    ],
    [
      'close with odd minutes',
      { closed: false, open: '09:00', close: '18:45' },
      'close',
    ],
    [
      'a single-digit hour',
      { closed: false, open: '9:00', close: '18:00' },
      'open',
    ],
    ['hour 24', { closed: false, open: '09:00', close: '24:00' }, 'close'],
    ['a non-string time', { closed: false, open: 9, close: 18 }, 'open'],
    ['a missing close', { closed: false, open: '09:00' }, 'close'],
    [
      'a time with seconds',
      { closed: false, open: '09:00:00', close: '18:00' },
      'open',
    ],
  ])('rejects %s', (_label, day, field) => {
    rejects(
      parseWeeklySchedule({ weekly: { ...validWeekly(), 4: day } }),
      `day 4: ${field} must be an HH:mm time on a 30-minute step between 00:00 and 23:30`,
    );
  });

  it('rejects a day without a boolean closed flag', () => {
    rejects(
      parseWeeklySchedule({
        weekly: { ...validWeekly(), 1: { open: '09:00', close: '18:00' } },
      }),
      'day 1: closed must be a boolean',
    );
    rejects(
      parseWeeklySchedule({ weekly: { ...validWeekly(), 1: 'open' } }),
      'day 1 must be an object',
    );
  });
});

describe('parseStartInterval', () => {
  const MESSAGE =
    'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.';

  it('returns undefined when the field is absent', () => {
    expect(parseStartInterval({ weekly: validWeekly() })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(parseStartInterval({ startIntervalMinutes: undefined })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it.each([30, 60, 180, 480])('accepts %p', (value) => {
    expect(parseStartInterval({ startIntervalMinutes: value })).toEqual({
      ok: true,
      value,
    });
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
    rejects(parseStartInterval({ startIntervalMinutes: value }), MESSAGE);
  });

  it('rejects a body that is not an object', () => {
    rejects(parseStartInterval(null), 'body must be a JSON object');
  });
});

describe('validateScheduleInput', () => {
  it('reads the week and the optional interval of one body', () => {
    expect(
      validateScheduleInput({
        weekly: validWeekly(),
        startIntervalMinutes: 60,
      }),
    ).toEqual({
      ok: true,
      value: { weekly: expect.any(Object), startIntervalMinutes: 60 },
    });
    expect(valueOf(validateScheduleInput({ weekly: validWeekly() }))).toEqual({
      weekly: expect.any(Object),
      startIntervalMinutes: undefined,
    });
  });

  it('reports the week before the interval when both are wrong', () => {
    rejects(
      validateScheduleInput({ weekly: {}, startIntervalMinutes: 45 }),
      'day 0 is required',
    );
    rejects(
      validateScheduleInput({
        weekly: validWeekly(),
        startIntervalMinutes: 45,
      }),
      'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.',
    );
  });
});
