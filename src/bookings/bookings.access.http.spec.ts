import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

/** Which /bookings routes need the admin key and which stay public. */
describe('Bookings HTTP access control', () => {
  const KEY = 'bookings-access-test-key';
  const TOKEN = 'a'.repeat(43);
  const ID = '507f1f77bcf86cd799439011';

  let app: INestApplication;
  let savedKey: string | undefined;
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    checkAvailability: jest.fn(),
    getStatistics: jest.fn(),
    getCancellation: jest.fn(),
    cancelByToken: jest.fn(),
  };

  beforeAll(async () => {
    savedKey = process.env.ADMIN_API_KEY;
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [{ provide: BookingsService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_API_KEY = KEY;
    for (const method of Object.values(service)) {
      method.mockResolvedValue({ ok: true });
    }
  });

  afterAll(async () => {
    await app.close();
    if (savedKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = savedKey;
  });

  const http = () => request(app.getHttpServer());
  const call = (method: string, path: string) =>
    (http() as unknown as Record<string, (p: string) => request.Test>)[method](
      path,
    );

  const protectedRoutes: [string, string, jest.Mock][] = [
    ['get', '/api/bookings', service.findAll],
    ['get', '/api/bookings/statistics', service.getStatistics],
    ['get', `/api/bookings/${ID}`, service.findOne],
    ['patch', `/api/bookings/${ID}`, service.update],
    ['delete', `/api/bookings/${ID}`, service.remove],
  ];

  describe.each(protectedRoutes)('%s %s', (method, path, handler) => {
    it('answers 401 without an Authorization header', async () => {
      await call(method, path).expect(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('answers 401 with a wrong key', async () => {
      await call(method, path)
        .set('Authorization', 'Bearer not-the-key')
        .expect(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('answers 401 for every key when ADMIN_API_KEY is unset', async () => {
      delete process.env.ADMIN_API_KEY;

      await call(method, path)
        .set('Authorization', `Bearer ${KEY}`)
        .expect(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('reaches the handler with the right key', async () => {
      await call(method, path)
        .set('Authorization', `Bearer ${KEY}`)
        .expect((res) => expect(res.status).toBeLessThan(300));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('public routes', () => {
    const publicRoutes: [string, string, jest.Mock][] = [
      ['post', '/api/bookings', service.create],
      ['post', '/api/bookings/availability', service.checkAvailability],
      ['get', `/api/bookings/cancel/${TOKEN}`, service.getCancellation],
      ['post', `/api/bookings/cancel/${TOKEN}`, service.cancelByToken],
    ];

    it.each(publicRoutes)(
      '%s %s works without any key',
      async (method, path, handler) => {
        await call(method, path)
          .send({})
          .expect((res) => expect(res.status).toBeLessThan(300));
        expect(handler).toHaveBeenCalledTimes(1);
      },
    );
  });
});
