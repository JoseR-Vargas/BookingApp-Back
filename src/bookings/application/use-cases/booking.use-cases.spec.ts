import { Result } from '../../../shared/domain/result';
import {
  BlockAlreadyTaken,
  BookingNotFound,
  BusinessHoursUnverifiable,
  CancellationClosed,
  MissingBookingData,
  TRIAL_LIMIT_MESSAGE,
  TrialLimitReached,
} from '../../domain/booking.errors';
import {
  CENTRO,
  PRINCIPAL,
  buildBookings,
  businessClock,
} from '../../bookings.testing';
import { CreateBookingInput } from './create-booking.use-case';

// 2026-03-25 is a Wednesday; 2026-03-29 is a Sunday.
const input = (
  overrides: Partial<CreateBookingInput> = {},
): CreateBookingInput => ({
  client: {
    name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '1234567890',
  },
  services: [{ id: 'corte' }],
  professional: { id: 'alex', name: 'Alex García' },
  date: '2026-03-25',
  time: '10:00',
  ...overrides,
});

const failure = <T>(result: Result<T>) => {
  if (result.ok) throw new Error('expected an Err');
  return result.error;
};
const value = <T>(result: Result<T>) => {
  if (!result.ok) throw new Error(`expected Ok, got ${result.error.message}`);
  return result.value;
};

describe('CreateBookingUseCase', () => {
  it('refuses a new booking when the trial of the business is over, and stores nothing', async () => {
    const app = buildBookings();
    app.trial.open = false;

    const error = failure(await app.create.execute(input()));

    expect(error).toBeInstanceOf(TrialLimitReached);
    expect(error.kind).toBe('forbidden');
    expect(error.message).toBe('Este negocio alcanzó el límite de su prueba.');
    expect(error.message).toBe(TRIAL_LIMIT_MESSAGE);
    expect(await app.list.execute()).toEqual({ ok: true, value: [] });
    expect(app.notifier.created_).toEqual([]);
    expect(app.catalog.calls).toEqual({});
  });

  it('keeps cancelling and reading bookings in a blocked business', async () => {
    const app = buildBookings();
    const { booking, cancelToken } = value(await app.create.execute(input()));
    app.trial.open = false;

    expect(value(await app.get.execute(booking.id))).toMatchObject({
      id: booking.id,
    });
    expect((await app.cancel.execute(cancelToken)).ok).toBe(true);
  });

  it('creates a confirmed booking from the catalog and returns the token once', async () => {
    const app = buildBookings();

    const { booking, cancelToken } = value(
      await app.create.execute(
        input({
          services: [{ id: 'tinte', name: 'x', price: 1 } as never],
          professional: { id: 'alex', name: 'Nombre falso' },
          time: '11:00',
        }),
      ),
    );

    expect(booking).toMatchObject({
      services: [{ id: 'tinte', name: 'Tinte', price: 2500, duration: 90 }],
      totalPrice: 2500,
      totalDuration: 90,
      professional: { id: 'alex', name: 'Alex García' },
      location: PRINCIPAL,
      slots: ['11:00', '11:30', '12:00'],
      status: 'confirmed',
      notes: '',
    });
    expect(cancelToken).toHaveLength(43);
    expect(booking).not.toHaveProperty('cancelTokenHash');
    expect(JSON.stringify(booking)).not.toContain(cancelToken);
  });

  it('stores only the hash of the token and finds the booking by it', async () => {
    const app = buildBookings();

    const { booking, cancelToken } = value(await app.create.execute(input()));

    await expect(
      app.repository.findByCancelTokenHash(app.tokens.hash(cancelToken)),
    ).resolves.toEqual(booking);
    await expect(
      app.repository.findByCancelTokenHash(cancelToken),
    ).resolves.toBeNull();
  });

  it('books several services back to back in consecutive slots', async () => {
    const app = buildBookings();

    const { booking } = value(
      await app.create.execute(
        input({ services: [{ id: 'corte' }, { id: 'tinte' }] }),
      ),
    );

    expect(booking.totalPrice).toBe(3700);
    expect(booking.totalDuration).toBe(150);
    expect(booking.slots).toEqual([
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
    ]);
  });

  it('does not trust the slots, status or totals the client sends', async () => {
    const app = buildBookings();

    const { booking } = value(
      await app.create.execute({
        ...input(),
        slots: ['18:00'],
        status: 'cancelled',
        totalPrice: 1,
      } as never),
    );

    expect(booking.slots).toEqual(['10:00', '10:30']);
    expect(booking.status).toBe('confirmed');
    expect(booking.totalPrice).toBe(1200);
  });

  it('announces the new booking with the token, after storing it', async () => {
    const app = buildBookings();

    const { booking, cancelToken } = value(await app.create.execute(input()));

    expect(app.notifier.created_).toEqual([{ booking, cancelToken }]);
  });

  it.each([
    [{ date: '', time: '' }, 'Fecha y hora son requeridas'],
    [{ professional: null }, 'Profesional es requerido'],
    [{ professional: { id: '', name: 'Alex' } }, 'Profesional es requerido'],
    [{ client: null }, 'Datos del cliente son requeridos'],
    [
      { client: { name: 'Juan', email: 'j@x.com', phone: '' } },
      'Datos del cliente son requeridos',
    ],
  ])(
    'rejects %j as a validation error (%s) before asking the catalog',
    async (overrides, message) => {
      const app = buildBookings();

      const error = failure(
        await app.create.execute(input(overrides as never)),
      );

      expect(error).toBeInstanceOf(MissingBookingData);
      expect(error.kind).toBe('validation');
      expect(error.message).toBe(message);
      expect(app.catalog.calls).toEqual({});
      expect(app.notifier.created_).toEqual([]);
    },
  );

  it.each([
    [null, 'Error de validación: debes seleccionar al menos un servicio'],
    [[], 'Error de validación: debes seleccionar al menos un servicio'],
    [
      [{ id: 'corte' }, { id: 'corte' }],
      'Error de validación: el servicio corte está repetido',
    ],
    [
      [{ id: 'corte' }, { id: 'nope' }],
      'Error de validación: el servicio nope no existe',
    ],
  ])('rejects the services %j', async (services, message) => {
    const app = buildBookings();

    const error = failure(
      await app.create.execute(input({ services: services as never })),
    );

    expect(error.kind).toBe('validation');
    expect(error.message).toBe(message);
    expect(await app.repository.findAll()).toEqual([]);
  });

  it('rejects an unknown professional, one that does not offer a service and one that does not work at the location', async () => {
    const app = buildBookings();

    expect(
      failure(await app.create.execute(input({ professional: { id: 'zzz' } })))
        .message,
    ).toBe('Error de validación: el profesional seleccionado no existe');
    expect(
      failure(
        await app.create.execute(
          input({
            services: [{ id: 'corte' }, { id: 'exclusivo' }],
            professional: { id: 'maria' },
          }),
        ),
      ).message,
    ).toBe('Error de validación: María López no ofrece Exclusivo');

    app.catalog.locations = [PRINCIPAL];
    expect(
      failure(
        await app.create.execute(
          input({ professional: { id: 'maria' }, location: { id: 'centro' } }),
        ),
      ).message,
    ).toBe('Error de validación: el local seleccionado no existe');
  });

  it('rejects a professional that does not work at the chosen location', async () => {
    const app = buildBookings();
    app.catalog.locations = [PRINCIPAL, CENTRO];

    const error = failure(
      await app.create.execute(
        input({ professional: { id: 'maria' }, location: { id: 'centro' } }),
      ),
    );

    expect(error.message).toBe(
      'Error de validación: María López no trabaja en Centro',
    );
  });

  it('rejects an invalid date, an unavailable start and a closed day', async () => {
    const app = buildBookings();

    expect(
      failure(await app.create.execute(input({ date: '2026-02-30' }))).message,
    ).toBe('Error de validación: la fecha 2026-02-30 no es válida');
    expect(
      failure(await app.create.execute(input({ time: '10:15' }))).message,
    ).toBe(
      'Error de validación: el horario 10:15 no está disponible para Corte el 2026-03-25',
    );
    expect(
      failure(await app.create.execute(input({ date: '2026-03-29' }))).message,
    ).toBe(
      'Error de validación: el horario 10:00 no está disponible para Corte el 2026-03-29',
    );
  });

  it('answers the 400-kind conflict when a block is already taken, and does not announce', async () => {
    const app = buildBookings();
    value(await app.create.execute(input()));
    app.notifier.created_ = [];

    const error = failure(await app.create.execute(input({ time: '10:30' })));

    expect(error).toBeInstanceOf(BlockAlreadyTaken);
    expect(error.kind).toBe('validation');
    expect(error.message).toBe(
      'Ya existe una reserva para Alex García el 2026-03-25 a las 10:30',
    );
    expect(app.notifier.created_).toEqual([]);
  });

  it('turns a conflict reported by the store (two requests racing) into the same error', async () => {
    const app = buildBookings();
    jest.spyOn(app.repository, 'findOccupiedSlots').mockResolvedValue([]); // the check passed, the store disagrees
    value(await app.create.execute(input()));

    const error = failure(await app.create.execute(input()));

    expect(error).toBeInstanceOf(BlockAlreadyTaken);
    expect(error.message).toBe(
      'Ya existe una reserva para Alex García el 2026-03-25 a las 10:00',
    );
    expect(app.notifier.created_).toHaveLength(1);
  });

  it('a cancelled booking never blocks, and another professional is free', async () => {
    const app = buildBookings();
    const first = value(await app.create.execute(input()));
    value(await app.create.execute(input({ professional: { id: 'maria' } })));
    await app.repository.cancelIfConfirmed(first.booking.id);

    expect(value(await app.create.execute(input())).booking.slots).toEqual([
      '10:00',
      '10:30',
    ]);
  });

  describe('location', () => {
    it('uses the chosen active location, with its name from the catalog', async () => {
      const app = buildBookings();
      app.catalog.locations = [PRINCIPAL, CENTRO];

      const { booking } = value(
        await app.create.execute(
          input({ location: { id: 'centro', name: 'Hacked' } as never }),
        ),
      );

      expect(booking.location).toEqual(CENTRO);
    });

    it('asks to choose when several are active and none is given', async () => {
      const app = buildBookings();
      app.catalog.locations = [PRINCIPAL, CENTRO];

      expect(failure(await app.create.execute(input())).message).toBe(
        'Error de validación: debes elegir un local',
      );
    });

    it('uses the default one when a single location is active (an id of null counts as absent)', async () => {
      const app = buildBookings();

      expect(value(await app.create.execute(input())).booking.location).toEqual(
        PRINCIPAL,
      );
      expect(
        value(
          await app.create.execute(
            input({ time: '12:00', location: { id: null } }),
          ),
        ).booking.location,
      ).toEqual(PRINCIPAL);
    });

    it('rejects an unknown location, also when the id is not text', async () => {
      const app = buildBookings();

      expect(
        failure(await app.create.execute(input({ location: { id: 'nope' } })))
          .message,
      ).toBe('Error de validación: el local seleccionado no existe');
      expect(
        failure(await app.create.execute(input({ location: { id: 42 } })))
          .message,
      ).toBe('Error de validación: el local seleccionado no existe');
    });
  });
});

describe('UpdateBookingUseCase', () => {
  const created = async () => {
    const app = buildBookings();
    const { booking } = value(await app.create.execute(input()));
    app.catalog.calls = {};
    return { app, booking };
  };

  it('answers ok(null) for a booking that does not exist', async () => {
    const { app } = await created();

    expect(value(await app.update.execute('nope', { notes: 'x' }))).toBeNull();
  });

  it('changes plain fields without asking the catalog', async () => {
    const { app, booking } = await created();

    const updated = value(await app.update.execute(booking.id, { notes: 'x' }));

    expect(updated?.notes).toBe('x');
    expect(updated?.slots).toEqual(booking.slots);
    expect(app.catalog.calls).toEqual({});
  });

  it('resolves the new block when the schedule changes, and the booking never blocks itself', async () => {
    const { app, booking } = await created();

    const updated = value(
      await app.update.execute(booking.id, { time: '10:30' }),
    );

    expect(updated?.time).toBe('10:30');
    expect(updated?.slots).toEqual(['10:30', '11:00']);
  });

  it('rejects a move onto a taken block with the 400 conflict', async () => {
    const { app, booking } = await created();
    value(await app.create.execute(input({ time: '14:00' })));

    const error = failure(
      await app.update.execute(booking.id, { time: '14:00' }),
    );

    expect(error).toBeInstanceOf(BlockAlreadyTaken);
    expect(error.message).toBe(
      'Ya existe una reserva para Alex García el 2026-03-25 a las 14:00',
    );
    expect((await app.repository.findById(booking.id))?.time).toBe('10:00');
  });

  it('rejects an unavailable start with the usual validation error', async () => {
    const { app, booking } = await created();

    expect(
      failure(await app.update.execute(booking.id, { time: '10:10' })).message,
    ).toBe(
      'Error de validación: el horario 10:10 no está disponible para Corte el 2026-03-25',
    );
  });

  it('changes services and professional only through the catalog', async () => {
    const { app, booking } = await created();

    const updated = value(
      await app.update.execute(booking.id, {
        services: [{ id: 'tinte' }],
        professional: { id: 'maria' },
        totalPrice: 1,
        slots: ['x'],
      } as never),
    );

    expect(updated).toMatchObject({
      services: [{ id: 'tinte', name: 'Tinte', price: 2500, duration: 90 }],
      totalPrice: 2500,
      totalDuration: 90,
      professional: { id: 'maria', name: 'María López' },
      slots: ['10:00', '10:30', '11:00'],
    });
  });

  it('never changes the stored location', async () => {
    const app = buildBookings();
    app.catalog.locations = [PRINCIPAL, CENTRO];
    const { booking } = value(
      await app.create.execute(input({ location: { id: 'centro' } })),
    );

    const updated = value(
      await app.update.execute(booking.id, { time: '11:00' }),
    );

    expect(updated?.location).toEqual(CENTRO);
  });

  it('validates a booking without location against the default one', async () => {
    const app = buildBookings();
    const legacy = value(await app.create.execute(input())).booking;
    const stored = app.repository as unknown as {
      stored: { booking: { location?: unknown } }[];
    };
    delete stored.stored[0].booking.location;
    app.catalog.calls = {};

    const updated = value(
      await app.update.execute(legacy.id, { time: '11:00' }),
    );

    expect(updated?.time).toBe('11:00');
    expect(app.catalog.calls.getLocation).toBe(1);
    expect(updated?.location).toBeUndefined();
  });

  it('does not re-validate a booking that is being cancelled, and re-validates one that comes back', async () => {
    const { app, booking } = await created();
    value(await app.create.execute(input({ time: '14:00' })));
    app.catalog.calls = {};

    const cancelled = value(
      await app.update.execute(booking.id, {
        status: 'cancelled',
        time: '14:00',
      }),
    );
    expect(cancelled?.status).toBe('cancelled');
    expect(app.catalog.calls.resolveServices).toBeUndefined();

    const error = failure(
      await app.update.execute(booking.id, { status: 'confirmed' }),
    );
    expect(error).toBeInstanceOf(BlockAlreadyTaken);
  });

  it('answers a validation error when the store rejects the data', async () => {
    const { app, booking } = await created();

    const error = failure(
      await app.update.execute(booking.id, { status: 'foo' }),
    );

    expect(error.kind).toBe('validation');
    expect(error.message).toMatch(/^Error de validación: /);
  });
});

describe('ListBookingsUseCase, GetBookingUseCase and DeleteBookingUseCase', () => {
  it('lists, reads and deletes; a missing booking is ok(null)', async () => {
    const app = buildBookings();
    const { booking } = value(await app.create.execute(input()));

    expect(value(await app.list.execute())).toEqual([booking]);
    expect(value(await app.get.execute(booking.id))).toEqual(booking);
    expect(value(await app.get.execute('nope'))).toBeNull();
    expect(value(await app.remove.execute(booking.id))).toEqual(booking);
    expect(value(await app.remove.execute(booking.id))).toBeNull();
    expect(value(await app.list.execute())).toEqual([]);
  });
});

describe('cancel by link', () => {
  const FAR = input({ date: '2999-01-07' });
  const created = async (options?: Parameters<typeof buildBookings>[0]) => {
    const app = buildBookings(options);
    const { booking, cancelToken } = value(await app.create.execute(FAR));
    return { app, booking, cancelToken };
  };

  it('shows what the booking is and that it can be cancelled', async () => {
    const { app, cancelToken } = await created();

    expect(value(await app.getCancellation.execute(cancelToken))).toEqual({
      state: 'cancellable',
      services: [{ name: 'Corte' }],
      professional: { name: 'Alex García' },
      date: '2999-01-07',
      time: '10:00',
    });
  });

  it('answers the same not-found for a malformed and an unknown token, without asking the store for a malformed one', async () => {
    const { app } = await created();
    const find = jest.spyOn(app.repository, 'findByCancelTokenHash');

    for (const token of ['not-a-token', '', 'a'.repeat(44)]) {
      const error = failure(await app.getCancellation.execute(token));
      expect(error).toBeInstanceOf(BookingNotFound);
      expect(error.message).toBe('Reserva no encontrada');
      expect(failure(await app.cancel.execute(token))).toBeInstanceOf(
        BookingNotFound,
      );
    }
    expect(find).not.toHaveBeenCalled();

    expect(failure(await app.cancel.execute('a'.repeat(43)))).toBeInstanceOf(
      BookingNotFound,
    );
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('cancels, announces once and answers the cancelled summary', async () => {
    const { app, booking, cancelToken } = await created();

    const summary = value(await app.cancel.execute(cancelToken));

    expect(summary.state).toBe('cancelled');
    expect((await app.repository.findById(booking.id))?.status).toBe(
      'cancelled',
    );
    expect(app.notifier.cancelled_).toHaveLength(1);
    expect(app.notifier.cancelled_[0]).toMatchObject({
      id: booking.id,
      status: 'cancelled',
    });
  });

  it('is idempotent: cancelling again answers the summary and announces nothing more', async () => {
    const { app, cancelToken } = await created();
    value(await app.cancel.execute(cancelToken));

    expect(value(await app.cancel.execute(cancelToken)).state).toBe(
      'cancelled',
    );
    expect(value(await app.getCancellation.execute(cancelToken)).state).toBe(
      'cancelled',
    );
    expect(app.notifier.cancelled_).toHaveLength(1);
  });

  it('two simultaneous cancellations cancel once and both answer the summary', async () => {
    const { app, cancelToken } = await created();

    const [first, second] = await Promise.all([
      app.cancel.execute(cancelToken),
      app.cancel.execute(cancelToken),
    ]);

    expect(value(first).state).toBe('cancelled');
    expect(value(second).state).toBe('cancelled');
    expect(app.notifier.cancelled_).toHaveLength(1);
  });

  it('refuses after the cutoff with the 409 error, while the page reports closed', async () => {
    const { app, cancelToken } = await created({
      // 2999-01-07 10:00; the clock says it is 09:59:30 that day.
      clock: businessClock('2999-01-07', '09:59', 30),
    });

    expect(value(await app.getCancellation.execute(cancelToken)).state).toBe(
      'closed',
    );
    const error = failure(await app.cancel.execute(cancelToken));
    expect(error).toBeInstanceOf(CancellationClosed);
    expect(error.kind).toBe('conflict');
    expect(app.notifier.cancelled_).toEqual([]);
  });

  it('still cancels exactly 60 seconds before the start', async () => {
    const { app, cancelToken } = await created({
      clock: businessClock('2999-01-07', '09:59', 0),
    });

    expect(value(await app.cancel.execute(cancelToken)).state).toBe(
      'cancelled',
    );
  });

  it('answers unavailable (503 kind) when the business timezone is unknown', async () => {
    const { app, cancelToken } = await created({
      clock: businessClock('2026-03-20', null),
    });

    for (const error of [
      failure(await app.getCancellation.execute(cancelToken)),
      failure(await app.cancel.execute(cancelToken)),
    ]) {
      expect(error).toBeInstanceOf(BusinessHoursUnverifiable);
      expect(error.kind).toBe('unavailable');
    }
  });

  it('answers a cancelled booking even without a known timezone', async () => {
    const { app, booking, cancelToken } = await created({
      clock: businessClock('2026-03-20', null),
    });
    await app.repository.cancelIfConfirmed(booking.id);

    expect(value(await app.getCancellation.execute(cancelToken)).state).toBe(
      'cancelled',
    );
    expect(value(await app.cancel.execute(cancelToken)).state).toBe(
      'cancelled',
    );
  });
});

describe('CheckSlotUseCase', () => {
  const check = (
    app: ReturnType<typeof buildBookings>,
    overrides: Record<string, unknown> = {},
  ) =>
    app.checkSlot.execute({
      date: '2026-03-25',
      time: '10:00',
      professionalId: 'alex',
      serviceIds: ['corte'],
      ...overrides,
    });

  it('is available on a free block and not on a taken one', async () => {
    const app = buildBookings();
    expect(value(await check(app))).toEqual({ available: true });

    value(await app.create.execute(input()));

    expect(value(await check(app))).toEqual({ available: false });
    expect(value(await check(app, { time: '11:00' }))).toEqual({
      available: true,
    });
    expect(value(await check(app, { professionalId: 'maria' }))).toEqual({
      available: true,
    });
  });

  it('is not available for an unknown location, a bad start, a professional that does not offer it or does not work there', async () => {
    const app = buildBookings();
    app.catalog.locations = [PRINCIPAL, CENTRO];

    expect(value(await check(app, { locationId: 'nope' }))).toEqual({
      available: false,
    });
    expect(value(await check(app, { time: '10:07' }))).toEqual({
      available: false,
    });
    expect(value(await check(app, { date: 'xx' }))).toEqual({
      available: false,
    });
    expect(value(await check(app, { professionalId: 'zzz' }))).toEqual({
      available: false,
    });
    expect(
      value(
        await check(app, {
          serviceIds: ['exclusivo'],
          professionalId: 'maria',
        }),
      ),
    ).toEqual({ available: false });
    expect(
      value(
        await check(app, { professionalId: 'maria', locationId: 'centro' }),
      ),
    ).toEqual({ available: false });
  });

  it('fails the way the booking does for a bad selection', async () => {
    const app = buildBookings();

    expect(failure(await check(app, { serviceIds: ['nope'] })).message).toBe(
      'Error de validación: el servicio nope no existe',
    );
    expect(failure(await check(app, { serviceIds: [] })).message).toBe(
      'Error de validación: debes seleccionar al menos un servicio',
    );
    expect(failure(await check(app, { serviceIds: undefined })).message).toBe(
      'Error de validación: debes seleccionar al menos un servicio',
    );
  });
});

describe('GetStatisticsUseCase', () => {
  it('counts every booking, sums the price and counts today by the UTC date', async () => {
    const app = buildBookings({ now: '2026-03-25T23:30:00Z' });
    value(await app.create.execute(input({ time: '10:00' })));
    value(
      await app.create.execute(
        input({ time: '12:00', services: [{ id: 'tinte' }] }),
      ),
    );
    value(await app.create.execute(input({ date: '2026-03-26' })));

    expect(value(await app.statistics.execute())).toEqual({
      totalBookings: 3,
      totalRevenue: 1200 + 2500 + 1200,
      todayBookings: 2,
    });
  });

  it('answers zeros without bookings', async () => {
    expect(value(await buildBookings().statistics.execute())).toEqual({
      totalBookings: 0,
      totalRevenue: 0,
      todayBookings: 0,
    });
  });
});
