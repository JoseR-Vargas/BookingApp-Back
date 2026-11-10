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
      { professional: { id: 'alex-garcia' }, slots: ['10:00', '11:00'] },
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
          slots: ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
        },
        {
          id: 'maria-lopez',
          name: 'María López',
          slots: [
            '09:00',
            '10:00',
            '11:00',
            '12:00',
            '13:00',
            '14:00',
            '15:00',
            '16:00',
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('client');
  });

  it('sizes the free window to the TOTAL duration of several services', async () => {
    bookings = [{ professional: { id: 'alex-garcia' }, slots: ['16:00'] }];

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
    // 180 min = 3 consecutive slots; Alex's 16:00 booking blocks 14:00-16:00 starts.
    expect(result.professionals).toEqual([
      {
        id: 'alex-garcia',
        name: 'Alex García',
        slots: ['09:00', '10:00', '11:00', '12:00', '13:00', '17:00'],
      },
      {
        id: 'maria-lopez',
        name: 'María López',
        slots: [
          '09:00',
          '10:00',
          '11:00',
          '12:00',
          '13:00',
          '14:00',
          '15:00',
          '16:00',
          '17:00',
        ],
      },
    ]);
  });

  it('only lists professionals offering ALL the services', async () => {
    const catalog = (service as unknown as { catalogService: CatalogService })
      .catalogService;
    const base = catalog.findService('servicio-basico')!;
    jest
      .spyOn(catalog, 'findService')
      .mockImplementation((id) =>
        id === 'servicio-premium'
          ? { ...base, id, professionals: ['maria-lopez'] }
          : base,
      );

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
});
