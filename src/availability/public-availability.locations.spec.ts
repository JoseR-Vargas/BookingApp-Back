import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { SCHEDULE } from '../catalog/catalog.config';
import { CatalogService } from '../catalog/catalog.service';
import { createFakeCatalog } from '../catalog/catalog.testing';
import { AvailabilityService } from './availability.service';
import { PublicAvailabilityController } from './public-availability.controller';
import {
  PublicAvailability,
  PublicAvailabilityService,
} from './public-availability.service';

type On = Extract<PublicAvailability, { enabled: true }>;

// 2026-10-19 is a Monday.
const NOW = new Date('2026-10-19T15:00:00Z');

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

/** Public availability by location (S8). */
describe('public availability by location', () => {
  let fake: ReturnType<typeof createFakeCatalog>;
  let service: PublicAvailabilityService;
  const getAvailability = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.BUSINESS_TIMEZONE;
    fake = createFakeCatalog({
      locations: [
        location('principal', 'Principal'),
        location('centro', 'Centro', {
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
        location('norte', 'Norte', {
          active: false,
          createdAt: new Date('2026-03-01T00:00:00Z'),
        }),
      ],
    });
    await fake.catalog.onModuleInit();
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 1,
      serviceIds: null,
    };
    service = new PublicAvailabilityService(fake.catalog, {
      getAvailability,
    } as never);
    getAvailability.mockImplementation((date: string) =>
      Promise.resolve({
        date,
        closed: false,
        services: [],
        totalDuration: 30,
        professionals: [
          { id: 'alex-garcia', name: 'Alex García', slots: ['16:00'] },
        ],
      }),
    );
  });

  it('lists the active locations and answers the default one when no locationId is given', async () => {
    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(result.locations).toEqual([
      { id: 'principal', name: 'Principal' },
      { id: 'centro', name: 'Centro' },
    ]);
    expect(result.locationId).toBe('principal');
    expect(getAvailability).toHaveBeenCalledWith(
      '2026-10-19',
      ['consulta-inicial'],
      'principal',
    );
  });

  it('computes the days for the requested location', async () => {
    const result = (await service.getPublicAvailability(
      'servicio-basico',
      NOW,
      'centro',
    )) as On;

    expect(result.locationId).toBe('centro');
    expect(result.serviceId).toBe('servicio-basico');
    expect(getAvailability).toHaveBeenCalledWith(
      '2026-10-19',
      ['servicio-basico'],
      'centro',
    );
    // Settings stay global: same services whatever the location.
    expect(result.services.map((s) => s.id)).toEqual([
      'consulta-inicial',
      'servicio-basico',
      'servicio-premium',
      'sesion-expres',
    ]);
  });

  it.each(['nope', 'norte'])(
    'answers 404 `Location "%s" not found` for an unknown or inactive location',
    async (id) => {
      const error = await service
        .getPublicAvailability(undefined, NOW, id)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(
        `Location "${id}" not found`,
      );
      expect(getAvailability).not.toHaveBeenCalled();
    },
  );

  it('stays { enabled: false } while the page is off, whatever the location', async () => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: false,
      days: 1,
      serviceIds: null,
    };

    expect(await service.getPublicAvailability(undefined, NOW, 'nope')).toEqual(
      { enabled: false },
    );
  });

  it('answers the locations even when no service is published', async () => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 1,
      serviceIds: [],
    };
    fake.serviceModel.docs.forEach((d) => (d.active = false));

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(result).toEqual({
      enabled: true,
      services: [],
      serviceId: null,
      locationId: 'principal',
      locations: [
        { id: 'principal', name: 'Principal' },
        { id: 'centro', name: 'Centro' },
      ],
      days: [],
    });
  });
});

describe('GET /api/public-availability?locationId', () => {
  let app: INestApplication;
  const getAvailability = jest.fn();

  beforeAll(async () => {
    const fake = createFakeCatalog({
      locations: [
        location('principal', 'Principal'),
        location('centro', 'Centro', {
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ],
    });
    await fake.catalog.onModuleInit();
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 1,
      serviceIds: null,
    };
    getAvailability.mockImplementation((date: string) =>
      Promise.resolve({
        date,
        closed: false,
        services: [],
        totalDuration: 30,
        professionals: [],
      }),
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicAvailabilityController],
      providers: [
        PublicAvailabilityService,
        { provide: CatalogService, useValue: fake.catalog },
        { provide: AvailabilityService, useValue: { getAvailability } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('returns locations and locationId, default when absent', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public-availability')
      .expect(200);

    expect(res.body.locationId).toBe('principal');
    expect(res.body.locations).toEqual([
      { id: 'principal', name: 'Principal' },
      { id: 'centro', name: 'Centro' },
    ]);
  });

  it('serves the requested location (trimmed) and 404s an unknown one', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/public-availability?locationId=%20centro%20')
      .expect(200);
    const missing = await request(app.getHttpServer())
      .get('/api/public-availability?locationId=nope')
      .expect(404);

    expect(ok.body.locationId).toBe('centro');
    expect(missing.body.message).toBe('Location "nope" not found');
  });

  it('ignores a blank locationId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public-availability?locationId=')
      .expect(200);

    expect(res.body.locationId).toBe('principal');
  });
});
