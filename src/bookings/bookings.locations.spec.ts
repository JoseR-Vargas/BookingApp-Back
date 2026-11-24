import { SCHEDULE } from '../catalog/catalog.config';
import { createFakeCatalog, createFakeModel } from '../catalog/catalog.testing';
import { BookingsService } from './bookings.service';

// 2026-10-19 is a Monday.
const MONDAY = '2026-10-19';

const location = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  address: '',
  active: true,
  weekly: SCHEDULE.weekly,
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...extra,
});

const dto = (extra: Record<string, unknown> = {}) =>
  ({
    client: { name: 'Juan Pérez', email: 'juan@example.com', phone: '123' },
    services: [{ id: 'consulta-inicial' }],
    professional: { id: 'alex-garcia', name: 'Alex García' },
    date: MONDAY,
    time: '11:00',
    ...extra,
  }) as never;

/**
 * Booking model double: the queries of the in-memory catalog models plus a
 * constructor whose `save` enforces the unique index on
 * (professional.id, date, slots) among confirmed bookings, like Mongo.
 */
function createBookingModel(initial: object[] = []) {
  const base = createFakeModel(initial);
  let counter = 0;
  const model: any = function (doc: Record<string, any>) {
    return {
      save: () => {
        const clash = base.docs.some(
          (other) =>
            other.status === 'confirmed' &&
            other.professional?.id === doc.professional.id &&
            other.date === doc.date &&
            (other.slots as string[]).some((slot) => doc.slots.includes(slot)),
        );
        if (clash) {
          return Promise.reject(
            Object.assign(new Error('E11000'), { code: 11000 }),
          );
        }
        const stored = { _id: `id-${++counter}`, ...doc };
        base.docs.push(stored);
        return Promise.resolve({ ...stored });
      },
    };
  };
  Object.assign(model, base);
  model.findById = (id: string) => ({
    exec: () =>
      Promise.resolve(base.docs.find((d) => String(d._id) === id) ?? null),
  });
  model.findByIdAndUpdate = jest.fn(
    (id: string, changes: Record<string, unknown>) => ({
      exec: () => {
        const target = base.docs.find((d) => String(d._id) === id);
        Object.assign(target!, changes);
        return Promise.resolve(target);
      },
    }),
  );
  return model as typeof model & { docs: Record<string, any>[] };
}

describe('BookingsService by location (S5)', () => {
  const build = async (
    options: { locations?: object[]; bookings?: object[] } = {},
  ) => {
    const fake = createFakeCatalog({
      locations: options.locations ?? [
        location('principal', 'Principal'),
        // Own interval: starts every 60 minutes.
        location('centro', 'Centro', {
          createdAt: new Date('2026-02-01T00:00:00Z'),
          startIntervalMinutes: 60,
        }),
        location('norte', 'Norte', {
          active: false,
          createdAt: new Date('2026-03-01T00:00:00Z'),
        }),
      ],
    });
    await fake.catalog.onModuleInit();
    // Alex rotates between the two locations; María only works at Principal.
    fake.professionalModel.docs[0].locationIds = ['principal', 'centro'];
    fake.professionalModel.docs[1].locationIds = ['principal'];
    const bookingModel = createBookingModel(options.bookings);
    const service = new BookingsService(
      bookingModel,
      { notifyNewBooking: jest.fn() } as never,
      { sendBookingConfirmation: jest.fn() } as never,
      fake.catalog,
      { notifyNewBooking: jest.fn() } as never,
    );
    return { service, bookingModel, fake };
  };

  const single = () => [location('principal', 'Principal')];

  describe('create', () => {
    it('stores the chosen location as { id, name } and returns it', async () => {
      const { service, bookingModel } = await build();

      const created = await service.create(dto({ location: { id: 'centro' } }));

      expect(created.location).toEqual({ id: 'centro', name: 'Centro' });
      expect(bookingModel.docs[0].location).toEqual({
        id: 'centro',
        name: 'Centro',
      });
      expect(bookingModel.docs[0].slots).toEqual(['11:00']);
    });

    it('takes the name from the catalog, never from the client', async () => {
      const { service, bookingModel } = await build();

      await service.create(dto({ location: { id: 'centro', name: 'Hacked' } }));

      expect(bookingModel.docs[0].location).toEqual({
        id: 'centro',
        name: 'Centro',
      });
    });

    it('uses the default location when absent and there is a single active location', async () => {
      const { service, bookingModel } = await build({ locations: single() });

      await service.create(dto());

      expect(bookingModel.docs[0].location).toEqual({
        id: 'principal',
        name: 'Principal',
      });
    });

    it('a deactivated extra location still counts as "a single active location"', async () => {
      const { service, bookingModel } = await build({
        locations: [
          location('principal', 'Principal'),
          location('norte', 'Norte', { active: false }),
        ],
      });

      await service.create(dto());

      expect(bookingModel.docs[0].location.id).toBe('principal');
    });

    it('rejects an absent location when several are active, saving nothing', async () => {
      const { service, bookingModel } = await build();

      await expect(service.create(dto())).rejects.toThrow(
        'Error de validación: debes elegir un local',
      );
      expect(bookingModel.docs).toHaveLength(0);
    });

    it.each(['nope', 'norte'])(
      'rejects an unknown or inactive location (%s)',
      async (id) => {
        const { service, bookingModel } = await build();

        await expect(service.create(dto({ location: { id } }))).rejects.toThrow(
          'Error de validación: el local seleccionado no existe',
        );
        expect(bookingModel.docs).toHaveLength(0);
      },
    );

    it('rejects a professional who does not work at the location, with both names', async () => {
      const { service, bookingModel } = await build();

      await expect(
        service.create(
          dto({
            location: { id: 'centro' },
            professional: { id: 'maria-lopez', name: 'María López' },
          }),
        ),
      ).rejects.toThrow(
        'Error de validación: María López no trabaja en Centro',
      );
      expect(bookingModel.docs).toHaveLength(0);
    });

    it('a professional without locationIds works at the default location only', async () => {
      const { service, fake } = await build();
      delete fake.professionalModel.docs[1].locationIds;
      const maria = {
        professional: { id: 'maria-lopez', name: 'María López' },
      };

      await expect(
        service.create(dto({ ...maria, location: { id: 'principal' } })),
      ).resolves.toBeDefined();
      await expect(
        service.create(dto({ ...maria, location: { id: 'centro' } })),
      ).rejects.toThrow('María López no trabaja en Centro');
    });

    it("rejects a time that THAT location's schedule does not offer (existing message)", async () => {
      const { service, bookingModel } = await build();

      // 11:30 is offered by Principal (every 30 min) but not by Centro (every 60).
      await expect(
        service.create(dto({ time: '11:30', location: { id: 'centro' } })),
      ).rejects.toThrow(
        `Error de validación: el horario 11:30 no está disponible para Consulta Inicial el ${MONDAY}`,
      );
      await expect(
        service.create(dto({ time: '11:30', location: { id: 'principal' } })),
      ).resolves.toBeDefined();
      expect(bookingModel.docs).toHaveLength(1);
    });

    it('occupancy is per professional: Alex at Centro 11:00 blocks Alex at Principal 11:00', async () => {
      const { service, bookingModel } = await build();
      await service.create(dto({ location: { id: 'centro' } }));

      await expect(
        service.create(dto({ location: { id: 'principal' } })),
      ).rejects.toThrow(
        `Ya existe una reserva para Alex García el ${MONDAY} a las 11:00`,
      );
      // María is free at the same time.
      await expect(
        service.create(
          dto({
            location: { id: 'principal' },
            professional: { id: 'maria-lopez', name: 'María López' },
          }),
        ),
      ).resolves.toBeDefined();
      expect(bookingModel.docs).toHaveLength(2);
    });

    it('the unique slot index also stops a race between two locations', async () => {
      const { service, bookingModel } = await build();
      // The occupancy pre-check sees nothing; only the index can catch it.
      jest.spyOn(bookingModel, 'find').mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve([]) }),
      } as never);
      await service.create(dto({ location: { id: 'centro' } }));

      await expect(
        service.create(dto({ location: { id: 'principal' } })),
      ).rejects.toThrow(
        `Ya existe una reserva para Alex García el ${MONDAY} a las 11:00`,
      );
    });

    it('a cancelled booking at another location does not block', async () => {
      const { service } = await build({
        bookings: [
          {
            _id: 'old',
            date: MONDAY,
            status: 'cancelled',
            professional: { id: 'alex-garcia', name: 'Alex García' },
            location: { id: 'centro', name: 'Centro' },
            slots: ['11:00'],
          },
        ],
      });

      await expect(
        service.create(dto({ location: { id: 'principal' } })),
      ).resolves.toBeDefined();
    });
  });

  describe('update (PATCH)', () => {
    const stored = (extra: object = {}) => ({
      _id: 'b1',
      client: { name: 'Juan', phone: '1' },
      services: [
        {
          id: 'consulta-inicial',
          name: 'Consulta Inicial',
          price: 500,
          duration: 30,
        },
      ],
      professional: { id: 'alex-garcia', name: 'Alex García' },
      date: MONDAY,
      time: '11:00',
      slots: ['11:00'],
      status: 'confirmed',
      ...extra,
    });

    it('validates a time change against the STORED location', async () => {
      const { service, bookingModel } = await build({
        bookings: [stored({ location: { id: 'centro', name: 'Centro' } })],
      });

      await expect(service.update('b1', { time: '11:30' })).rejects.toThrow(
        `Error de validación: el horario 11:30 no está disponible para Consulta Inicial el ${MONDAY}`,
      );
      await service.update('b1', { time: '12:00' });

      expect(bookingModel.docs[0].time).toBe('12:00');
      expect(bookingModel.docs[0].location).toEqual({
        id: 'centro',
        name: 'Centro',
      });
    });

    it('cannot change the location, even if the client sends one', async () => {
      const { service, bookingModel } = await build({
        bookings: [stored({ location: { id: 'centro', name: 'Centro' } })],
      });

      await service.update('b1', {
        time: '12:00',
        location: { id: 'principal' },
      } as never);

      const [, changes] = bookingModel.findByIdAndUpdate.mock.calls[0];
      expect(changes).not.toHaveProperty('location');
      expect(bookingModel.docs[0].location.id).toBe('centro');
    });

    it('a legacy booking without location is validated against the default location and stays without one', async () => {
      const { service, bookingModel } = await build({ bookings: [stored()] });

      // 11:30 is offered by the default location (every 30 min).
      await service.update('b1', { time: '11:30' });

      expect(bookingModel.docs[0].time).toBe('11:30');
      expect(bookingModel.docs[0]).not.toHaveProperty('location');
    });

    it('rejects a professional change to someone who does not work at the stored location', async () => {
      const { service } = await build({
        bookings: [stored({ location: { id: 'centro', name: 'Centro' } })],
      });

      await expect(
        service.update('b1', {
          professional: { id: 'maria-lopez', name: 'María López' },
        }),
      ).rejects.toThrow(
        'Error de validación: María López no trabaja en Centro',
      );
    });

    it('a status-only change needs no location validation', async () => {
      const { service, bookingModel } = await build({
        bookings: [stored({ location: { id: 'norte', name: 'Norte' } })],
      });

      await service.update('b1', { status: 'cancelled' });

      expect(bookingModel.docs[0].status).toBe('cancelled');
    });
  });

  describe('checkAvailability (POST /bookings/availability)', () => {
    const check = (
      service: BookingsService,
      time: string,
      professionalId = 'alex-garcia',
      locationId?: string,
    ) =>
      service.checkAvailability(
        MONDAY,
        time,
        professionalId,
        ['consulta-inicial'],
        locationId,
      );

    it("uses the given location's schedule", async () => {
      const { service } = await build();

      expect(await check(service, '11:30', 'alex-garcia', 'centro')).toEqual({
        available: false,
      });
      expect(await check(service, '11:00', 'alex-garcia', 'centro')).toEqual({
        available: true,
      });
    });

    it('defaults to the default location when locationId is omitted', async () => {
      const { service } = await build();

      expect(await check(service, '11:30')).toEqual({ available: true });
    });

    it('is not available for a professional who does not work at the location', async () => {
      const { service } = await build();

      expect(await check(service, '11:00', 'maria-lopez', 'centro')).toEqual({
        available: false,
      });
    });

    it('is not available at an unknown or inactive location', async () => {
      const { service } = await build();

      expect(await check(service, '11:00', 'alex-garcia', 'nope')).toEqual({
        available: false,
      });
      expect(await check(service, '11:00', 'alex-garcia', 'norte')).toEqual({
        available: false,
      });
    });

    it('sees a booking made at another location', async () => {
      const { service } = await build({
        bookings: [
          {
            _id: 'b1',
            date: MONDAY,
            status: 'confirmed',
            professional: { id: 'alex-garcia', name: 'Alex García' },
            location: { id: 'centro', name: 'Centro' },
            slots: ['11:00'],
          },
        ],
      });

      expect(await check(service, '11:00', 'alex-garcia', 'principal')).toEqual(
        { available: false },
      );
    });
  });
});
