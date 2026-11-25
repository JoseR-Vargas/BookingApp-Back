import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { SCHEDULE } from '../../../catalog/catalog.config';
import { createFakeCatalog } from '../../../catalog/catalog.testing';
import { ok } from '../../../shared/domain/result';
import { DomainErrorFilter } from '../../../shared/infrastructure/http/domain-error.filter';
import { BUSINESS_CLOCK } from '../../application/ports/business-clock.port';
import { CATALOG_LOOKUP } from '../../application/ports/catalog-lookup.port';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { GetPublicAvailabilityUseCase } from '../../application/use-cases/get-public-availability.use-case';
import { CatalogFacadeLookup } from '../catalog/catalog-facade.lookup';
import { PublicAvailabilityController } from './public-availability.controller';

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

describe('GET /api/public-availability', () => {
  let app: INestApplication;
  let fake: ReturnType<typeof createFakeCatalog>;
  const execute = jest.fn();

  beforeAll(async () => {
    fake = createFakeCatalog({
      locations: [
        location('principal', 'Principal'),
        location('centro', 'Centro', {
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ],
    });
    await fake.catalog.onModuleInit();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicAvailabilityController],
      providers: [
        GetPublicAvailabilityUseCase,
        {
          provide: CATALOG_LOOKUP,
          useValue: new CatalogFacadeLookup(fake.catalog),
        },
        {
          provide: BUSINESS_CLOCK,
          useValue: { now: () => ({ today: '2026-10-19', time: null }) },
        },
        { provide: GetAvailabilityUseCase, useValue: { execute } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    execute.mockImplementation(({ date }: { date: string }) =>
      Promise.resolve(
        ok({
          date,
          closed: false,
          location: { id: 'principal', name: 'Principal' },
          services: [],
          totalDuration: 30,
          professionals: [
            { id: 'alex-garcia', name: 'Alex García', slots: ['09:00'] },
          ],
        }),
      ),
    );
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: false,
      days: 7,
      serviceIds: null,
    };
  });

  const enable = (extra: object = {}) => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 1,
      serviceIds: null,
      ...extra,
    };
  };

  it('is off by default and needs no admin key', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public-availability')
      .expect(200);
    expect(res.body).toEqual({ enabled: false });
  });

  it('serves the published services and days once enabled; unpublished ones are 404', async () => {
    enable({ days: 2, serviceIds: ['servicio-basico'] });

    const res = await request(app.getHttpServer())
      .get('/api/public-availability')
      .expect(200);
    expect(res.body.serviceId).toBe('servicio-basico');
    expect(res.body.days).toHaveLength(2);
    expect(res.body.days[0].times).toEqual([
      {
        time: '09:00',
        professionals: [{ id: 'alex-garcia', name: 'Alex García' }],
      },
    ]);

    const missing = await request(app.getHttpServer())
      .get('/api/public-availability?serviceId=sesion-expres')
      .expect(404);
    expect(missing.body).toEqual({
      message: 'Service "sesion-expres" not found',
      error: 'Not Found',
      statusCode: 404,
    });
    await request(app.getHttpServer())
      .get('/api/public-availability?serviceId=servicio-basico')
      .expect(200);
  });

  it('returns locations and locationId, default when absent', async () => {
    enable();

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
    enable();

    const found = await request(app.getHttpServer())
      .get('/api/public-availability?locationId=%20centro%20')
      .expect(200);
    const missing = await request(app.getHttpServer())
      .get('/api/public-availability?locationId=nope')
      .expect(404);

    expect(found.body.locationId).toBe('centro');
    expect(missing.body).toEqual({
      message: 'Location "nope" not found',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('ignores a blank locationId and a blank serviceId', async () => {
    enable();

    const res = await request(app.getHttpServer())
      .get('/api/public-availability?locationId=&serviceId=%20')
      .expect(200);

    expect(res.body.locationId).toBe('principal');
    expect(res.body.serviceId).toBe('consulta-inicial');
  });

  it('stays { enabled: false } while the page is off, whatever the location', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public-availability?locationId=nope&serviceId=nope')
      .expect(200);

    expect(res.body).toEqual({ enabled: false });
  });

  it('answers the locations even when no service is published', async () => {
    enable({ serviceIds: [] });

    const res = await request(app.getHttpServer())
      .get('/api/public-availability')
      .expect(200);

    expect(res.body).toEqual({
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
