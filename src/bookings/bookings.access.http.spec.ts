import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { BookingsController } from './infrastructure/http/bookings.controller';
import { buildBookings } from './bookings.testing';

/** Which /bookings routes need the admin key and which stay public. */
describe('Bookings HTTP access control', () => {
  const KEY = 'bookings-access-test-key';
  const TOKEN = 'a'.repeat(43);
  const ID = '507f1f77bcf86cd799439011';

  let app: INestApplication;
  let savedKey: string | undefined;
  let bookings: ReturnType<typeof buildBookings>;

  beforeAll(async () => {
    savedKey = process.env.ADMIN_API_KEY;
    bookings = buildBookings();
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: bookings.create.constructor, useValue: bookings.create },
        { provide: bookings.list.constructor, useValue: bookings.list },
        {
          provide: bookings.listRecentIds.constructor,
          useValue: bookings.listRecentIds,
        },
        { provide: bookings.get.constructor, useValue: bookings.get },
        { provide: bookings.update.constructor, useValue: bookings.update },
        { provide: bookings.remove.constructor, useValue: bookings.remove },
        {
          provide: bookings.getCancellation.constructor,
          useValue: bookings.getCancellation,
        },
        {
          provide: bookings.cancel.constructor,
          useValue: bookings.cancel,
        },
        {
          provide: bookings.checkSlot.constructor,
          useValue: bookings.checkSlot,
        },
        {
          provide: bookings.statistics.constructor,
          useValue: bookings.statistics,
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_API_KEY = KEY;
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

  const protectedRoutes: [string, string][] = [
    ['get', '/api/bookings'],
    ['get', '/api/bookings/statistics'],
    ['get', `/api/bookings/${ID}`],
    ['patch', `/api/bookings/${ID}`],
    ['delete', `/api/bookings/${ID}`],
  ];

  describe('admin routes', () => {
    it('answers 401 without an Authorization header', async () => {
      for (const [method, path] of protectedRoutes) {
        await call(method, path).expect(401);
      }
    });

    it('answers 401 with a wrong key', async () => {
      for (const [method, path] of protectedRoutes) {
        await call(method, path)
          .set('Authorization', 'Bearer wrong-key')
          .expect(401);
      }
    });

    it('answers 401 for every key when ADMIN_API_KEY is unset', async () => {
      delete process.env.ADMIN_API_KEY;
      for (const [method, path] of protectedRoutes) {
        await call(method, path)
          .set('Authorization', 'Bearer whatever')
          .expect(401);
      }
      process.env.ADMIN_API_KEY = KEY;
    });

    it('reaches the handler with the right key', async () => {
      for (const [method, path] of protectedRoutes) {
        await call(method, path)
          .set('Authorization', `Bearer ${KEY}`)
          .expect((res) => expect(res.status).toBeLessThan(300));
      }
    });
  });

  describe('public routes', () => {
    it('answers without any key', async () => {
      await call('post', '/api/bookings')
        .send({})
        .expect((res) => expect(res.status).toBeLessThan(500));
      await call('post', '/api/bookings/availability')
        .send({})
        .expect((res) => expect(res.status).toBeLessThan(500));
      await call('get', `/api/bookings/cancel/${TOKEN}`).expect(404);
      await call('post', `/api/bookings/cancel/${TOKEN}`).expect(404);
    });
  });
});
