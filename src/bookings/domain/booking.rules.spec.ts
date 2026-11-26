import { SEED_SCHEDULE } from '../../catalog/domain/seed-schedule';
import { Booking } from './booking';
import {
  BlockAlreadyTaken,
  InvalidBooking,
  MissingBookingData,
} from './booking.errors';
import {
  checkBlocksFree,
  checkDate,
  checkProfessional,
  checkWorksAtLocation,
  planUpdate,
  requireBookingFields,
  resolveWindow,
  serviceIdsOf,
  windowSlotsFor,
} from './booking.rules';

const request = (overrides: Record<string, unknown> = {}) => ({
  client: { name: 'Juan', phone: '123' },
  professional: { id: 'alex' },
  date: '2026-03-25',
  time: '10:00',
  ...overrides,
});

describe('requireBookingFields', () => {
  it('accepts a complete request', () => {
    expect(requireBookingFields(request())).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it.each([
    [{ date: '' }, 'Fecha y hora son requeridas'],
    [{ time: undefined }, 'Fecha y hora son requeridas'],
    [{ professional: null }, 'Profesional es requerido'],
    [{ professional: { id: '' } }, 'Profesional es requerido'],
    [{ client: null }, 'Datos del cliente son requeridos'],
    [
      { client: { name: 'Juan', phone: '' } },
      'Datos del cliente son requeridos',
    ],
    [{ client: { name: '', phone: '1' } }, 'Datos del cliente son requeridos'],
  ])('rejects %j with "%s"', (overrides, message) => {
    const result = requireBookingFields(request(overrides));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MissingBookingData);
      expect(result.error.kind).toBe('validation');
      expect(result.error.message).toBe(message);
    }
  });

  it('reports the date before the professional and the professional before the client', () => {
    const result = requireBookingFields({ date: '', professional: null });
    expect(!result.ok && result.error.message).toBe(
      'Fecha y hora son requeridas',
    );
    const second = requireBookingFields({
      professional: null,
      date: 'd',
      time: 't',
    });
    expect(!second.ok && second.error.message).toBe('Profesional es requerido');
  });
});

describe('serviceIdsOf', () => {
  it('lists the ids, with an empty id for a hole, and ignores a non-list', () => {
    expect(serviceIdsOf([{ id: 'a' }, {}])).toEqual(['a', '']);
    expect(serviceIdsOf(null)).toEqual([]);
    expect(serviceIdsOf(undefined)).toEqual([]);
  });
});

describe('checkProfessional', () => {
  const selection = {
    services: [
      {
        id: 's1',
        name: 'Corte',
        price: 1,
        duration: 30,
        professionals: ['alex'],
      },
      {
        id: 's2',
        name: 'Tinte',
        price: 1,
        duration: 30,
        professionals: ['maria'],
      },
    ],
    totalPrice: 2,
    totalDuration: 60,
  };

  it('answers the professional when every service is offered', () => {
    const alex = { id: 'alex', name: 'Alex' };
    expect(
      checkProfessional(alex, {
        ...selection,
        services: [selection.services[0]],
      }),
    ).toEqual({ ok: true, value: alex });
  });

  it('rejects a missing professional', () => {
    const result = checkProfessional(null, selection);
    expect(!result.ok && result.error.message).toBe(
      'Error de validación: el profesional seleccionado no existe',
    );
  });

  it('names the services the professional does not offer', () => {
    const result = checkProfessional({ id: 'alex', name: 'Alex' }, selection);
    expect(!result.ok && result.error.message).toBe(
      'Error de validación: Alex no ofrece Tinte',
    );
  });
});

describe('checkWorksAtLocation and checkDate', () => {
  it('rejects a professional that does not work at the location', () => {
    const result = checkWorksAtLocation(false, 'Alex', {
      id: 'c',
      name: 'Centro',
    });
    expect(!result.ok && result.error.message).toBe(
      'Error de validación: Alex no trabaja en Centro',
    );
    expect(checkWorksAtLocation(true, 'Alex', { id: 'c', name: 'C' }).ok).toBe(
      true,
    );
  });

  it('rejects a date that is not on the calendar', () => {
    const result = checkDate('2026-02-30');
    expect(!result.ok && result.error).toBeInstanceOf(InvalidBooking);
    expect(!result.ok && result.error.message).toBe(
      'Error de validación: la fecha 2026-02-30 no es válida',
    );
    expect(checkDate('2026-03-25').ok).toBe(true);
  });
});

describe('windowSlotsFor and resolveWindow', () => {
  // 2026-03-25 is a Wednesday.
  it('gives the consecutive slots of the block', () => {
    expect(windowSlotsFor('2026-03-25', '10:00', 90, SEED_SCHEDULE)).toEqual([
      '10:00',
      '10:30',
      '11:00',
    ]);
  });

  it('is null off the grid, on an invalid date or on a closed day', () => {
    expect(windowSlotsFor('2026-03-25', '10:10', 30, SEED_SCHEDULE)).toBeNull();
    expect(windowSlotsFor('nope', '10:00', 30, SEED_SCHEDULE)).toBeNull();
    // 2026-03-29 is a Sunday.
    expect(windowSlotsFor('2026-03-29', '10:00', 30, SEED_SCHEDULE)).toBeNull();
  });

  it('names the services and the date when the start is not offered', () => {
    const result = resolveWindow(
      '2026-03-25',
      '10:10',
      [{ name: 'Corte' }, { name: 'Tinte' }],
      60,
      SEED_SCHEDULE,
    );
    expect(!result.ok && result.error.message).toBe(
      'Error de validación: el horario 10:10 no está disponible para Corte, Tinte el 2026-03-25',
    );
  });
});

describe('checkBlocksFree', () => {
  it('rejects a block that overlaps an occupied slot, keeping the 400 kind', () => {
    const result = checkBlocksFree(
      ['10:00', '10:30'],
      new Set(['10:30']),
      'Alex',
      '2026-03-25',
      '10:00',
    );
    expect(!result.ok && result.error).toBeInstanceOf(BlockAlreadyTaken);
    expect(!result.ok && result.error.kind).toBe('validation');
    expect(!result.ok && result.error.message).toBe(
      'Ya existe una reserva para Alex el 2026-03-25 a las 10:00',
    );
  });

  it('accepts a free block', () => {
    expect(
      checkBlocksFree(['10:00'], new Set(['11:00']), 'A', 'd', 't').ok,
    ).toBe(true);
  });
});

describe('planUpdate', () => {
  const current: Booking = {
    id: 'b1',
    client: { name: 'Juan', phone: '1' },
    services: [{ id: 's1', name: 'Corte', price: 1, duration: 30 }],
    totalPrice: 1,
    totalDuration: 30,
    professional: { id: 'alex', name: 'Alex' },
    date: '2026-03-25',
    time: '10:00',
    slots: ['10:00'],
    notes: '',
    status: 'confirmed',
  };

  it('does not resolve the schedule when only notes change', () => {
    const plan = planUpdate(current, { notes: 'x' });
    expect(plan.resolveSchedule).toBe(false);
    expect(plan.changes).toEqual({ notes: 'x' });
  });

  it.each([
    [{ time: '11:00' }],
    [{ date: '2026-03-26' }],
    [{ services: [{ id: 's2' }] }],
    [{ professional: { id: 'maria' } }],
  ])('resolves the schedule when %j changes', (change) => {
    expect(planUpdate(current, change).resolveSchedule).toBe(true);
  });

  it('removes the fields only the server computes', () => {
    const plan = planUpdate(current, {
      notes: 'x',
      slots: ['x'],
      totalPrice: 1,
      totalDuration: 1,
      location: { id: 'l' },
      cancelTokenHash: 'h',
      services: [{ id: 's1' }],
      professional: { id: 'alex' },
    });
    expect(plan.changes).toEqual({ notes: 'x' });
    expect(plan.resolveSchedule).toBe(false);
  });

  it('does not resolve a booking that is being cancelled, but resolves a reactivated one', () => {
    expect(
      planUpdate(current, { status: 'cancelled', time: '11:00' })
        .resolveSchedule,
    ).toBe(false);
    expect(
      planUpdate({ ...current, status: 'cancelled' }, { status: 'confirmed' })
        .resolveSchedule,
    ).toBe(true);
  });

  it('keeps a cancelled booking cancelled when its status is not touched', () => {
    expect(
      planUpdate({ ...current, status: 'cancelled' }, { time: '11:00' })
        .resolveSchedule,
    ).toBe(false);
  });

  it('targets the current values for what the request leaves out', () => {
    expect(planUpdate(current, { time: '11:00' }).target).toEqual({
      serviceIds: ['s1'],
      professionalId: 'alex',
      date: '2026-03-25',
      time: '11:00',
      status: 'confirmed',
    });
  });
});
