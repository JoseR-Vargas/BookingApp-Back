import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { SCHEDULE } from '../../../catalog/catalog.config';
import { createFakeCatalog } from '../../../catalog/catalog.testing';
import { DomainErrorFilter } from '../../../shared/infrastructure/http/domain-error.filter';
import { CATALOG_LOOKUP } from '../../application/ports/catalog-lookup.port';
import {
  OCCUPIED_SLOTS_READER,
  OccupiedSlotsReader,
} from '../../application/ports/occupied-slots.reader';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { CatalogFacadeLookup } from '../catalog/catalog-facade.lookup';
import { InMemoryOccupiedSlotsReader } from '../persistence/in-memory/in-memory-occupied-slots.reader';
import { AvailabilityController } from './availability.controller';

// 2026-10-19 is a Monday, 2026-10-18 a Sunday.
const MONDAY = '2026-10-19';
const URL = '/api/availability';

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

/**
 * The whole availability HTTP suite over the in-memory occupied-slots reader
 * (the database swap proof): no Mongo model is involved.
 */
describe('GET /api/availability (in-memory adapters)', () => {
  let app: INestApplication;
  let reader: InMemoryOccupiedSlotsReader;
  let failing: boolean;

  const get = (query: string) =>
    request(app.getHttpServer()).get(`${URL}${query}`);

  beforeAll(async () => {
    const fake = createFakeCatalog({
      locations: [
        location('principal', 'Principal'),
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
    fake.professionalModel.docs[0].locationIds = ['principal', 'centro'];
    reader = new InMemoryOccupiedSlotsReader();
    const readerOrDown: OccupiedSlotsReader = {
      findOccupied: (date, ids) =>
        failing
          ? Promise.reject(new Error('db down'))
          : reader.findOccupied(date, ids),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [
        GetAvailabilityUseCase,
        {
          provide: CATALOG_LOOKUP,
          useValue: new CatalogFacadeLookup(fake.catalog),
        },
        { provide: OCCUPIED_SLOTS_READER, useValue: readerOrDown },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    failing = false;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('answers the day of the default location', async () => {
    const res = await get(`?date=${MONDAY}&serviceIds=consulta-inicial`).expect(
      200,
    );

    expect(Object.keys(res.body)).toEqual([
      'date',
      'closed',
      'location',
      'services',
      'totalDuration',
      'professionals',
    ]);
    expect(res.body).toMatchObject({
      date: MONDAY,
      closed: false,
      location: { id: 'principal', name: 'Principal' },
      services: [
        { id: 'consulta-inicial', name: 'Consulta Inicial', duration: 30 },
      ],
      totalDuration: 30,
    });
    expect(res.body.professionals.map((p: { id: string }) => p.id)).toEqual([
      'alex-garcia',
      'maria-lopez',
    ]);
  });

  it('parses the comma separated ids (trimmed) and sums the durations', async () => {
    const res = await get(
      `?date=${MONDAY}&serviceIds=consulta-inicial,%20servicio-basico`,
    ).expect(200);

    expect(res.body.services.map((s: { id: string }) => s.id)).toEqual([
      'consulta-inicial',
      'servicio-basico',
    ]);
    expect(res.body.totalDuration).toBe(90);
  });

  it('marks Sunday as closed', async () => {
    const res = await get('?date=2026-10-18&serviceIds=servicio-basico').expect(
      200,
    );

    expect(res.body.closed).toBe(true);
    expect(res.body.professionals[0].slots).toEqual([]);
  });

  it('forwards a trimmed locationId and ignores a blank one', async () => {
    const centro = await get(
      `?date=${MONDAY}&serviceIds=consulta-inicial&locationId=%20centro%20`,
    ).expect(200);
    const blank = await get(
      `?date=${MONDAY}&serviceIds=consulta-inicial&locationId=%20%20`,
    ).expect(200);

    expect(centro.body.location).toEqual({ id: 'centro', name: 'Centro' });
    expect(centro.body.professionals.map((p: { id: string }) => p.id)).toEqual([
      'alex-garcia',
    ]);
    expect(blank.body.location.id).toBe('principal');
  });

  it('the booking of a professional at one location blocks the same hours at the other', async () => {
    reader.seed({
      professionalId: 'alex-garcia',
      date: MONDAY,
      slots: ['11:00'],
      status: 'confirmed',
      location: { id: 'centro', name: 'Centro' },
    });
    reader.seed({
      professionalId: 'maria-lopez',
      date: MONDAY,
      slots: ['11:00'],
      status: 'cancelled',
    });

    const principal = await get(
      `?date=${MONDAY}&serviceIds=consulta-inicial`,
    ).expect(200);
    const [alex, maria] = principal.body.professionals;

    expect(alex.slots).not.toContain('11:00');
    expect(alex.slots).toContain('10:30');
    expect(maria.slots).toContain('11:00'); // cancelled: not occupied
  });

  it.each([
    ['', 'date must be a valid YYYY-MM-DD date'],
    ['?serviceIds=servicio-basico', 'date must be a valid YYYY-MM-DD date'],
    [
      '?date=abc&serviceIds=servicio-basico',
      'date must be a valid YYYY-MM-DD date',
    ],
    [
      '?date=2026-13-40&serviceIds=servicio-basico',
      'date must be a valid YYYY-MM-DD date',
    ],
    [
      '?date=2026-02-30&serviceIds=servicio-basico',
      'date must be a valid YYYY-MM-DD date',
    ],
    ['?date=abc&serviceIds=', 'date must be a valid YYYY-MM-DD date'],
    [`?date=${MONDAY}`, 'serviceIds is required'],
    [`?date=${MONDAY}&serviceIds=`, 'serviceIds is required'],
    [`?date=${MONDAY}&serviceIds=%20%20`, 'serviceIds is required'],
    [`?date=${MONDAY}&serviceIds=a&serviceIds=b`, 'serviceIds is required'],
    [
      `?date=${MONDAY}&serviceIds=a,,b`,
      'serviceIds must be a comma-separated list of service ids',
    ],
    [
      `?date=${MONDAY}&serviceIds=a,%20`,
      'serviceIds must be a comma-separated list of service ids',
    ],
    [
      `?date=${MONDAY}&serviceIds=servicio-basico,servicio-basico`,
      'el servicio servicio-basico está repetido',
    ],
  ])('answers 400 for %s', async (query, message) => {
    const res = await get(query).expect(400);

    expect(res.body).toEqual({
      message,
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it.each([
    [
      `?date=${MONDAY}&serviceIds=servicio-basico,nope`,
      'Service "nope" not found',
    ],
    [
      `?date=${MONDAY}&serviceIds=servicio-basico&locationId=nope`,
      'Location "nope" not found',
    ],
    [
      `?date=${MONDAY}&serviceIds=servicio-basico&locationId=norte`,
      'Location "norte" not found',
    ],
    [
      `?date=${MONDAY}&serviceIds=nope&locationId=nope`,
      'Location "nope" not found',
    ],
  ])('answers 404 for %s', async (query, message) => {
    const res = await get(query).expect(404);

    expect(res.body).toEqual({
      message,
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('answers 500 when the store fails', async () => {
    failing = true;

    const res = await get(`?date=${MONDAY}&serviceIds=servicio-basico`).expect(
      500,
    );

    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
