import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from '../catalog/catalog.service';
import { createFakeCatalog } from '../catalog/catalog.testing';
import { Booking } from '../bookings/schemas/booking.schema';
import { AvailabilityService } from './availability.service';

/** Half-hour start times from `first` to `last`, both inclusive. */
const times = (first: string, last: string): string[] => {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const result: string[] = [];
  for (let at = toMinutes(first); at <= toMinutes(last); at += 30) {
    result.push(
      `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`,
    );
  }
  return result;
};

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let fake: ReturnType<typeof createFakeCatalog>;
  let bookings: unknown[];
  const exec = jest.fn(() => Promise.resolve(bookings));
  const lean = jest.fn(() => ({ exec }));
  const bookingModel = { find: jest.fn(() => ({ lean })) };

  beforeEach(async () => {
    bookings = [];
    jest.clearAllMocks();
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: CatalogService, useValue: fake.catalog },
        { provide: getModelToken(Booking.name), useValue: bookingModel },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
  });

  it('rejects an unknown service without querying bookings', async () => {
    await expect(
      service.getAvailability('2026-10-19', ['servicio-basico', 'nope']),
    ).rejects.toMatchObject({ failure: 'unknown', serviceId: 'nope' });
    expect(bookingModel.find).not.toHaveBeenCalled();
  });

  it('rejects duplicated and empty service lists', async () => {
    await expect(
      service.getAvailability('2026-10-19', [
        'servicio-basico',
        'servicio-basico',
      ]),
    ).rejects.toMatchObject({ failure: 'duplicate' });
    await expect(
      service.getAvailability('2026-10-19', []),
    ).rejects.toMatchObject({ failure: 'empty' });
  });

  it('rejects an invalid date', async () => {
    await expect(
      service.getAvailability('2026-13-40', ['servicio-basico']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loads non-cancelled bookings for the date and the common professionals in one query', async () => {
    await service.getAvailability('2026-10-19', ['servicio-basico']);

    expect(bookingModel.find).toHaveBeenCalledTimes(1);
    const [filter, projection] = bookingModel.find.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({
      date: '2026-10-19',
      'professional.id': { $in: ['alex-garcia', 'maria-lopez'] },
      status: { $ne: 'cancelled' },
    });
    expect(projection).not.toHaveProperty('client');
  });

  it('computes free slots per professional for a single service', async () => {
    bookings = [
      { professional: { id: 'alex-garcia' }, slots: ['10:00', '10:30'] },
      { professional: { id: 'maria-lopez' }, slots: ['18:00'] },
    ];

    const result = await service.getAvailability('2026-10-19', [
      'servicio-premium',
    ]);

    expect(result).toEqual({
      date: '2026-10-19',
      closed: false,
      services: [
        { id: 'servicio-premium', name: 'Servicio Premium', duration: 90 },
      ],
      totalDuration: 90,
      professionals: [
        {
          id: 'alex-garcia',
          name: 'Alex García',
          // 90 min = 3 blocks; the 10:00 booking blocks starts 09:00-10:30.
          slots: times('11:00', '18:30'),
        },
        {
          id: 'maria-lopez',
          name: 'María López',
          // 18:00 is taken: starts 17:00-18:00 are blocked, 18:30 still fits.
          slots: [...times('09:00', '16:30'), '18:30'],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('client');
  });

  it('sizes the free window to the TOTAL duration of several services', async () => {
    bookings = [
      { professional: { id: 'alex-garcia' }, slots: ['16:00', '16:30'] },
    ];

    const result = await service.getAvailability('2026-10-19', [
      'consulta-inicial',
      'servicio-basico',
      'servicio-premium',
    ]);

    expect(result.totalDuration).toBe(180);
    expect(result.services.map((s) => s.id)).toEqual([
      'consulta-inicial',
      'servicio-basico',
      'servicio-premium',
    ]);
    // 180 min = 6 consecutive blocks; Alex's 16:00-17:00 booking splits the day.
    expect(result.professionals).toEqual([
      {
        id: 'alex-garcia',
        name: 'Alex García',
        slots: [...times('09:00', '13:00'), '17:00'],
      },
      {
        id: 'maria-lopez',
        name: 'María López',
        slots: times('09:00', '17:00'),
      },
    ]);
  });

  describe('30-minute grid', () => {
    const alexSlots = async (serviceId: string) => {
      const result = await service.getAvailability('2026-10-19', [serviceId]);
      return result.professionals.find((p) => p.id === 'alex-garcia')!.slots;
    };

    it('a 20-minute booking at 09:00 leaves 09:30 free', async () => {
      bookings = [{ professional: { id: 'alex-garcia' }, slots: ['09:00'] }];

      const slots = await alexSlots('sesion-expres');

      expect(slots).not.toContain('09:00');
      expect(slots).toContain('09:30');
    });

    it('a 90-minute booking at 09:00 blocks 09:30 and 10:00 and frees 10:30', async () => {
      bookings = [
        {
          professional: { id: 'alex-garcia' },
          slots: ['09:00', '09:30', '10:00'],
        },
      ];

      const slots = await alexSlots('consulta-inicial');

      expect(slots).not.toContain('09:30');
      expect(slots).not.toContain('10:00');
      expect(slots[0]).toBe('10:30');
    });

    it('offers the last start that fits before closing, weekday and Saturday', async () => {
      const weekday = await alexSlots('servicio-premium');
      expect(weekday[weekday.length - 1]).toBe('18:30');

      const saturday = await service.getAvailability('2026-10-24', [
        'servicio-premium',
      ]);
      const saturdaySlots = saturday.professionals[0].slots;
      expect(saturdaySlots[saturdaySlots.length - 1]).toBe('16:30');
    });
  });

  it('only lists professionals offering ALL the services', async () => {
    fake.serviceModel.docs.find(
      (d) => d.id === 'servicio-premium',
    )!.professionals = ['maria-lopez'];

    const result = await service.getAvailability('2026-10-19', [
      'servicio-basico',
      'servicio-premium',
    ]);

    expect(result.professionals.map((p) => p.id)).toEqual(['maria-lopez']);
  });

  it('marks Sunday as closed with empty slots and skips the query', async () => {
    const result = await service.getAvailability('2026-10-18', [
      'servicio-basico',
    ]);

    expect(result.closed).toBe(true);
    expect(result.professionals).toEqual([
      { id: 'alex-garcia', name: 'Alex García', slots: [] },
      { id: 'maria-lopez', name: 'María López', slots: [] },
    ]);
    expect(bookingModel.find).not.toHaveBeenCalled();
  });

  describe('starts per day', () => {
    const alexSlots = async (date: string) =>
      (
        await service.getAvailability(date, ['consulta-inicial'])
      ).professionals.find((p) => p.id === 'alex-garcia')!.slots;

    it('offers the Monday list only on Monday; Tuesday keeps its own rule', async () => {
      const weekly = fake.settingsModel.docs[0].weekly;
      weekly[1] = {
        closed: false,
        open: '09:00',
        close: '20:00',
        starts: ['09:00', '12:00', '16:30'],
      };

      expect(await alexSlots('2026-10-19')).toEqual([
        '09:00',
        '12:00',
        '16:30',
      ]);
      expect((await alexSlots('2026-10-20')).slice(0, 3)).toEqual([
        '09:00',
        '09:30',
        '10:00',
      ]);
    });

    it('still excludes a listed start that is occupied', async () => {
      fake.settingsModel.docs[0].weekly[1] = {
        closed: false,
        open: '09:00',
        close: '20:00',
        starts: ['09:00', '12:00'],
      };
      bookings = [{ professional: { id: 'alex-garcia' }, slots: ['12:00'] }];

      expect(await alexSlots('2026-10-19')).toEqual(['09:00']);
    });
  });

  describe('start interval', () => {
    const alexSlots = async (serviceId: string) => {
      const result = await service.getAvailability('2026-10-19', [serviceId]);
      return result.professionals.find((p) => p.id === 'alex-garcia')!.slots;
    };

    beforeEach(() => {
      fake.settingsModel.docs[0].startIntervalMinutes = 180;
      fake.serviceModel.docs.find(
        (d) => d.id === 'servicio-premium',
      )!.duration = 180;
    });

    it('offers only every 180 minutes from opening for a 30-minute service', async () => {
      expect(await alexSlots('consulta-inicial')).toEqual([
        '09:00',
        '12:00',
        '15:00',
        '18:00',
      ]);
    });

    it('offers only the starts where a 3-hour service fits', async () => {
      expect(await alexSlots('servicio-premium')).toEqual([
        '09:00',
        '12:00',
        '15:00',
      ]);
    });

    it('still excludes offered starts whose blocks are occupied', async () => {
      bookings = [{ professional: { id: 'alex-garcia' }, slots: ['12:30'] }];

      expect(await alexSlots('consulta-inicial')).toEqual([
        '09:00',
        '12:00',
        '15:00',
        '18:00',
      ]);
      bookings = [{ professional: { id: 'alex-garcia' }, slots: ['12:00'] }];

      expect(await alexSlots('consulta-inicial')).toEqual([
        '09:00',
        '15:00',
        '18:00',
      ]);
    });

    it('reads a stored document without the field as 30', async () => {
      delete fake.settingsModel.docs[0].startIntervalMinutes;

      expect(await alexSlots('consulta-inicial')).toEqual(
        times('09:00', '19:30'),
      );
    });
  });
});
