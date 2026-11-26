import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PUBLIC_RATE_LIMITER } from '../shared/application/rate-limiter.port';
import { SlidingWindowRateLimiter } from '../shared/infrastructure/rate-limit/sliding-window-rate-limiter';
import { buildBookings } from './bookings.testing';
import { BookingsController } from './infrastructure/http/bookings.controller';

/** `POST /api/bookings` is limited per IP; the admin routes are not (spec 22). */
describe('Bookings HTTP rate limit', () => {
  const KEY = 'bookings-rate-limit-test-key';
  let app: INestApplication;
  let savedKey: string | undefined;
  const bookings = buildBookings();

  beforeAll(async () => {
    savedKey = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        ...[
          bookings.create,
          bookings.list,
          bookings.get,
          bookings.update,
          bookings.remove,
          bookings.getCancellation,
          bookings.cancel,
          bookings.checkSlot,
          bookings.statistics,
        ].map((useCase) => ({
          provide: useCase.constructor,
          useValue: useCase,
        })),
        {
          provide: PUBLIC_RATE_LIMITER,
          useValue: new SlidingWindowRateLimiter(
            { now: () => new Date('2026-11-26T10:00:00Z') },
            { max: 2, windowMs: 60_000 },
          ),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (savedKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = savedKey;
  });

  it('answers 429 to the third booking from one IP, but never to the admin list', async () => {
    const http = request(app.getHttpServer());
    // An empty body is a 400 (validation): it still counts against the limit.
    await http.post('/api/bookings').send({}).expect(400);
    await http.post('/api/bookings').send({}).expect(400);
    const res = await http.post('/api/bookings').send({}).expect(429);

    expect(res.body).toEqual({
      statusCode: 429,
      message: 'Demasiadas peticiones. Intenta más tarde.',
    });
    for (let i = 0; i < 5; i++) {
      await http
        .get('/api/bookings')
        .set('Authorization', `Bearer ${KEY}`)
        .expect(200);
    }
  });
});
