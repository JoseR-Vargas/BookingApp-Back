import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from '../catalog/catalog.service';
import { Booking } from '../bookings/schemas/booking.schema';
import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let bookings: unknown[];
  const exec = jest.fn(() => Promise.resolve(bookings));
  const lean = jest.fn(() => ({ exec }));
  const bookingModel = { find: jest.fn(() => ({ lean })) };

  beforeEach(async () => {
    bookings = [];
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        CatalogService,
        { provide: getModelToken(Booking.name), useValue: bookingModel },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
  });

  it('returns null for an unknown service without querying bookings', async () => {
    await expect(
      service.getAvailability('2026-10-19', 'nope'),
    ).resolves.toBeNull();
    expect(bookingModel.find).not.toHaveBeenCalled();
  });

  it('rejects an invalid date', async () => {
    await expect(
      service.getAvailability('2026-13-40', 'servicio-basico'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loads non-cancelled bookings for the date and service professionals in one query', async () => {
    await service.getAvailability('2026-10-19', 'servicio-basico');

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

  it('computes free slots per professional for the requested service', async () => {
    bookings = [
      {
        professional: { id: 'alex-garcia' },
        service: { duration: 90 },
        time: '10:00',
      },
      {
        professional: { id: 'maria-lopez' },
        service: { duration: 60 },
        time: '18:00',
      },
    ];

    const result = await service.getAvailability(
      '2026-10-19',
      'servicio-premium',
    );

    expect(result).toEqual({
      date: '2026-10-19',
      closed: false,
      service: {
        id: 'servicio-premium',
        name: 'Servicio Premium',
        duration: 90,
      },
      professionals: [
        {
          id: 'alex-garcia',
          name: 'Alex García',
          slots: ['14:00', '15:00', '16:00', '17:00', '18:00'],
        },
        {
          id: 'maria-lopez',
          name: 'María López',
          slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('client');
  });

  it('only lists professionals offering the service', async () => {
    const catalog = (service as unknown as { catalogService: CatalogService })
      .catalogService;
    jest.spyOn(catalog, 'findService').mockReturnValue({
      id: 'solo',
      name: 'Solo',
      description: '',
      price: 1,
      duration: 60,
      professionals: ['maria-lopez'],
      icon: '',
    });

    const result = await service.getAvailability('2026-10-19', 'solo');

    expect(result?.professionals.map((p) => p.id)).toEqual(['maria-lopez']);
  });

  it('marks Sunday as closed with empty slots and skips the query', async () => {
    const result = await service.getAvailability(
      '2026-10-18',
      'servicio-basico',
    );

    expect(result?.closed).toBe(true);
    expect(result?.professionals).toEqual([
      { id: 'alex-garcia', name: 'Alex García', slots: [] },
      { id: 'maria-lopez', name: 'María López', slots: [] },
    ]);
    expect(bookingModel.find).not.toHaveBeenCalled();
  });
});
