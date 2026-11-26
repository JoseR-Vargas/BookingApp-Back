import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PUBLIC_RATE_LIMITER } from '../../application/rate-limiter.port';
import { UseGuards } from '@nestjs/common';
import { SlidingWindowRateLimiter } from '../rate-limit/sliding-window-rate-limiter';
import {
  PUBLIC_RATE_LIMITED_MESSAGE,
  PublicRateLimitGuard,
} from './public-rate-limit.guard';

@Controller('limited')
class LimitedController {
  @Get()
  @UseGuards(PublicRateLimitGuard)
  read() {
    return { ok: true };
  }

  @Post()
  @UseGuards(PublicRateLimitGuard)
  write() {
    return { ok: true };
  }
}

@Controller('free')
class FreeController {
  @Get()
  read() {
    return { ok: true };
  }
}

describe('PublicRateLimitGuard', () => {
  let app: INestApplication;
  let now: number;

  const build = async (withLimiter: boolean) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LimitedController, FreeController],
      providers: [
        PublicRateLimitGuard,
        ...(withLimiter
          ? [
              {
                provide: PUBLIC_RATE_LIMITER,
                useValue: new SlidingWindowRateLimiter(
                  { now: () => new Date(now) },
                  { max: 2, windowMs: 60_000 },
                ),
              },
            ]
          : []),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  };

  beforeEach(() => {
    now = Date.parse('2026-11-26T10:00:00Z');
  });
  afterEach(() => app.close());

  it('answers 429 with the exact message past the limit, shared by every guarded route', async () => {
    await build(true);
    const http = request(app.getHttpServer());

    await http.get('/api/limited').expect(200);
    await http.post('/api/limited').expect(201);
    const res = await http.get('/api/limited').expect(429);

    expect(res.body).toEqual({
      statusCode: 429,
      message: 'Demasiadas peticiones. Intenta más tarde.',
    });
    expect(PUBLIC_RATE_LIMITED_MESSAGE).toBe(
      'Demasiadas peticiones. Intenta más tarde.',
    );
  });

  it('lets the same IP through again once the window has passed', async () => {
    await build(true);
    const http = request(app.getHttpServer());
    await http.get('/api/limited').expect(200);
    await http.get('/api/limited').expect(200);
    await http.get('/api/limited').expect(429);

    now += 61_000;

    await http.get('/api/limited').expect(200);
  });

  it('does not touch routes without the guard', async () => {
    await build(true);
    const http = request(app.getHttpServer());
    for (let i = 0; i < 5; i++) await http.get('/api/free').expect(200);
  });

  it('stays open when no limiter is bound (modules tested in isolation)', async () => {
    await build(false);
    const http = request(app.getHttpServer());
    for (let i = 0; i < 5; i++) await http.get('/api/limited').expect(200);
  });
});
