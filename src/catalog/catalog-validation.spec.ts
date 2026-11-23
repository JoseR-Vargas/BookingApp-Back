import { BadRequestException } from '@nestjs/common';
import {
  parseProfessionalCreate,
  parseProfessionalUpdate,
  parseServiceCreate,
  parsePublicAvailability,
  parseServiceUpdate,
  parseStartInterval,
  parseWeeklySchedule,
  slugify,
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

describe('slugify', () => {
  it.each([
    ['Alex García', 'alex-garcia'],
    ['  María   López  ', 'maria-lopez'],
    ['Sesión Exprés 2x1!', 'sesion-expres-2x1'],
    ['--Corte & Barba--', 'corte-barba'],
    ['ÑANDÚ', 'nandu'],
  ])('turns %p into %p', (name, slug) => {
    expect(slugify(name, 'item')).toBe(slug);
  });

  it('uses the fallback when nothing alphanumeric remains', () => {
    expect(slugify('!!! ???', 'service')).toBe('service');
    expect(slugify('日本語', 'professional')).toBe('professional');
  });
});

describe('parseProfessionalCreate', () => {
  it('applies defaults and trims strings', () => {
    expect(parseProfessionalCreate({ name: '  Ana Ruiz  ' })).toEqual({
      name: 'Ana Ruiz',
      specialty: '',
      experience: '',
      active: true,
    });
  });

  it('accepts all editable fields and ignores unknown ones', () => {
    expect(
      parseProfessionalCreate({
        id: 'hacked',
        name: 'Ana',
        specialty: 'Colorist',
        experience: '3 años',
        active: false,
        rating: 1,
        avatar: 'x',
      }),
    ).toEqual({
      name: 'Ana',
      specialty: 'Colorist',
      experience: '3 años',
      active: false,
    });
  });

  it.each([
    [{}, /name is required/],
    [{ name: '   ' }, /name must be between 1 and 80/],
    [{ name: 'x'.repeat(81) }, /name must be between 1 and 80/],
    [{ name: 5 }, /name must be a string/],
    [{ name: 'a', specialty: 'x'.repeat(81) }, /specialty must be at most 80/],
    [
      { name: 'a', experience: 'x'.repeat(41) },
      /experience must be at most 40/,
    ],
    [{ name: 'a', active: 'yes' }, /active must be a boolean/],
  ])('rejects %j', (body, message) => {
    rejects(() => parseProfessionalCreate(body), message);
  });

  it.each([null, undefined, 'text', 42, [], [{ name: 'a' }]])(
    'rejects a non-object body %j',
    (body) => {
      rejects(
        () => parseProfessionalCreate(body),
        /body must be a JSON object/,
      );
    },
  );

  it('accepts the length boundaries', () => {
    expect(
      parseProfessionalCreate({
        name: 'x'.repeat(80),
        specialty: 'y'.repeat(80),
        experience: 'z'.repeat(40),
      }),
    ).toMatchObject({ name: 'x'.repeat(80) });
  });
});

describe('parseProfessionalUpdate', () => {
  it('returns only the provided editable fields', () => {
    expect(parseProfessionalUpdate({ active: false, rating: 1 })).toEqual({
      active: false,
    });
    expect(parseProfessionalUpdate({ name: ' New ' })).toEqual({
      name: 'New',
    });
  });

  it('allows clearing optional text fields', () => {
    expect(parseProfessionalUpdate({ specialty: '' })).toEqual({
      specialty: '',
    });
  });

  it('rejects an empty name and bodies with no editable field', () => {
    rejects(
      () => parseProfessionalUpdate({ name: '' }),
      /name must be between/,
    );
    rejects(() => parseProfessionalUpdate({}), /at least one editable field/);
    rejects(
      () => parseProfessionalUpdate({ id: 'x', rating: 3 }),
      /at least one editable field/,
    );
  });
});

describe('parseServiceCreate', () => {
  const valid = {
    name: 'Corte',
    description: '  Corte clásico ',
    price: 1500,
    duration: 45,
    professionals: ['alex-garcia', 'maria-lopez', 'alex-garcia'],
  };

  it('normalises a valid payload (trim, dedupe professionals, active default)', () => {
    expect(parseServiceCreate({ ...valid, icon: 'hack' })).toEqual({
      name: 'Corte',
      description: 'Corte clásico',
      price: 1500,
      duration: 45,
      professionals: ['alex-garcia', 'maria-lopez'],
      active: true,
    });
  });

  it('defaults description to an empty string', () => {
    const { description: _description, ...rest } = valid;
    expect(parseServiceCreate(rest).description).toBe('');
  });

  it.each([
    [{ ...valid, name: undefined }, /name is required/],
    [{ ...valid, price: undefined }, /price is required/],
    [{ ...valid, duration: undefined }, /duration is required/],
    [{ ...valid, professionals: undefined }, /professionals is required/],
    [{ ...valid, price: -1 }, /price must be an integer >= 0/],
    [{ ...valid, price: 10.5 }, /price must be an integer >= 0/],
    [{ ...valid, price: '100' }, /price must be an integer >= 0/],
    [{ ...valid, price: Number.NaN }, /price must be an integer >= 0/],
    [
      { ...valid, duration: 4 },
      /duration must be an integer between 5 and 480/,
    ],
    [
      { ...valid, duration: 481 },
      /duration must be an integer between 5 and 480/,
    ],
    [
      { ...valid, duration: 30.5 },
      /duration must be an integer between 5 and 480/,
    ],
    [
      { ...valid, professionals: [] },
      /professionals must be a non-empty array/,
    ],
    [
      { ...valid, professionals: 'alex' },
      /professionals must be a non-empty array/,
    ],
    [{ ...valid, professionals: [''] }, /professionals must contain only ids/],
    [{ ...valid, professionals: [1] }, /professionals must contain only ids/],
    [
      { ...valid, description: 'x'.repeat(301) },
      /description must be at most 300/,
    ],
    [{ ...valid, active: 1 }, /active must be a boolean/],
  ])('rejects %j', (body, message) => {
    rejects(() => parseServiceCreate(body), message);
  });

  it.each([
    [
      { price: 0, duration: 5 },
      { price: 0, duration: 5 },
    ],
    [
      { price: 99999, duration: 480 },
      { price: 99999, duration: 480 },
    ],
  ])('accepts the numeric boundaries %j', (patch, expected) => {
    expect(parseServiceCreate({ ...valid, ...patch })).toMatchObject(expected);
  });
});

describe('parseServiceUpdate', () => {
  it('returns only the provided editable fields', () => {
    expect(
      parseServiceUpdate({ price: 10, active: false, icon: 'x', id: 'y' }),
    ).toEqual({ price: 10, active: false });
  });

  it('validates the provided fields with the same rules', () => {
    rejects(() => parseServiceUpdate({ duration: 3 }), /duration must be/);
    rejects(() => parseServiceUpdate({ price: -5 }), /price must be/);
    rejects(() => parseServiceUpdate({ professionals: [] }), /non-empty/);
    rejects(() => parseServiceUpdate({}), /at least one editable field/);
  });
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
