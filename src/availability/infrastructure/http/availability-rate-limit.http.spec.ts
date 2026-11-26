import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PUBLIC_RATE_LIMITER } from '../../../shared/application/rate-limiter.port';
import { ok } from '../../../shared/domain/result';
import { SlidingWindowRateLimiter } from '../../../shared/infrastructure/rate-limit/sliding-window-rate-limiter';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { GetPublicAvailabilityUseCase } from '../../application/use-cases/get-public-availability.use-case';
import { AvailabilityController } from './availability.controller';
import { PublicAvailabilityController } from './public-availability.controller';

const MESSAGE = 'Demasiadas peticiones. Intenta más tarde.';

describe('the public availability routes share a per-IP limit (spec 22)', () => {
  let app: INestApplication;
  let now: number;
  const execute = jest.fn();
  const executePublic = jest.fn();

  beforeAll(async () => {
    now = Date.parse('2026-11-26T10:00:00Z');
    const moduleRef = await Test.createTestingModule({
      controllers: [AvailabilityController, PublicAvailabilityController],
      providers: [
        { provide: GetAvailabilityUseCase, useValue: { execute } },
        {
          provide: GetPublicAvailabilityUseCase,
          useValue: { execute: executePublic },
        },
        {
          provide: PUBLIC_RATE_LIMITER,
          useValue: new SlidingWindowRateLimiter(
            { now: () => new Date(now) },
            { max: 3, windowMs: 60_000 },
          ),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());

  it('answers 429 on both routes once the IP spent its budget, and recovers', async () => {
    execute.mockResolvedValue(ok({ date: '2026-10-19' }));
    executePublic.mockResolvedValue(ok({ enabled: false }));
    const http = request(app.getHttpServer());
    const url = '/api/availability?date=2026-10-19&serviceIds=a';

    await http.get(url).expect(200);
    await http.get('/api/public-availability').expect(200);
    await http.get(url).expect(200);
    const blocked = await http.get('/api/public-availability').expect(429);
    const blockedToo = await http.get(url).expect(429);

    expect(blocked.body).toEqual({ statusCode: 429, message: MESSAGE });
    expect(blockedToo.body).toEqual({ statusCode: 429, message: MESSAGE });
    expect(executePublic).toHaveBeenCalledTimes(1); // the refused request never reached the use case

    now += 60_001;
    await http.get(url).expect(200);
  });
});
