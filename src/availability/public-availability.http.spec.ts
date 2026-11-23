import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CatalogService } from '../catalog/catalog.service';
import { createFakeCatalog } from '../catalog/catalog.testing';
import { AvailabilityService } from './availability.service';
import { PublicAvailabilityController } from './public-availability.controller';
import { PublicAvailabilityService } from './public-availability.service';

describe('GET /api/public-availability', () => {
  let app: INestApplication;
  let fake: ReturnType<typeof createFakeCatalog>;
  const getAvailability = jest.fn();

  beforeAll(async () => {
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
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

  beforeEach(() => {
    getAvailability.mockImplementation((date: string) =>
      Promise.resolve({
        date,
        closed: false,
        services: [],
        totalDuration: 30,
        professionals: [
          { id: 'alex-garcia', name: 'Alex García', slots: ['09:00'] },
        ],
      }),
    );
  });

  it('is off by default and needs no admin key', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public-availability')
      .expect(200);
    expect(res.body).toEqual({ enabled: false });
  });

  it('serves the published services and days once enabled; unpublished ones are 404', async () => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 2,
      serviceIds: ['servicio-basico'],
    };

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

    await request(app.getHttpServer())
      .get('/api/public-availability?serviceId=sesion-expres')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/public-availability?serviceId=servicio-basico')
      .expect(200);
  });
});
