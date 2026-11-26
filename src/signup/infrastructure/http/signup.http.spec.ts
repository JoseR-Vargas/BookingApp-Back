import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DomainErrorFilter } from '../../../shared/infrastructure/http/domain-error.filter';
import { SIGNUP_RATE_LIMITER } from '../../application/ports/signup-rate-limiter.port';
import { SignUpBusinessUseCase } from '../../application/use-cases/sign-up-business.use-case';
import { buildSignup } from '../../signup.testing';
import { InMemorySignupRateLimiter } from '../rate-limit/in-memory-signup-rate-limiter';
import {
  SIGNUP_RATE_LIMITED_MESSAGE,
  SignupController,
} from './signup.controller';

const body = (over: Record<string, unknown> = {}) => ({
  businessName: 'Barbería Sur',
  adminName: 'Ana',
  email: 'ana@example.com',
  password: 'a-long-password',
  ...over,
});

describe('POST /api/signup (in-memory adapters)', () => {
  let app: INestApplication;
  let signup: ReturnType<typeof buildSignup>;
  let now: number;

  beforeEach(async () => {
    now = Date.parse('2026-11-25T10:00:00Z');
    signup = buildSignup();
    const moduleRef = await Test.createTestingModule({
      controllers: [SignupController],
      providers: [
        { provide: SignUpBusinessUseCase, useValue: signup.useCase },
        {
          provide: SIGNUP_RATE_LIMITER,
          useValue: new InMemorySignupRateLimiter({
            now: () => new Date(now),
          }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
  });

  afterEach(() => app.close());

  const post = (payload: unknown = body()) =>
    request(app.getHttpServer() as Server)
      .post('/api/signup')
      .send(payload as object);

  it('answers 201 with the business, the owner and the session cookie of the new business, no X-Tenant needed', async () => {
    const res = await post();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ok: true,
      tenant: { slug: 'barberia-sur', name: 'Barbería Sur' },
      user: expect.objectContaining({
        email: 'ana@example.com',
        name: 'Ana',
        role: 'owner',
        active: true,
      }) as unknown,
    });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^admin_session=[\w-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    const token = /admin_session=([\w-]+)/.exec(cookie)![1];
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('a-long-password');
  });

  it('uses the slug the person typed', async () => {
    const res = await post(body({ slug: 'Mi-Local' }));
    expect(res.status).toBe(201);
    expect((res.body as { tenant: { slug: string } }).tenant.slug).toBe(
      'mi-local',
    );
  });

  it.each([
    [
      'an invalid slug',
      { slug: 'a' },
      400,
      'El slug debe tener de 3 a 40 caracteres: letras minúsculas, números y guiones.',
    ],
    [
      'a reserved slug',
      { slug: 'admin' },
      400,
      'El slug "admin" está reservado.',
    ],
    [
      'a repeated slug',
      { slug: 'principal' },
      409,
      'El slug "principal" ya está en uso.',
    ],
    ['an invalid email', { email: 'nope' }, 400, 'El correo no es válido.'],
    [
      'a weak password',
      { password: 'corta' },
      400,
      'La contraseña debe tener al menos 10 caracteres.',
    ],
    [
      'a missing business name',
      { businessName: undefined },
      400,
      'El nombre del negocio debe tener de 1 a 80 caracteres.',
    ],
  ])(
    'rejects %s, says why in Spanish and creates nothing',
    async (_n, over, status, message) => {
      const res = await post(body(over));

      expect(res.status).toBe(status);
      expect((res.body as { message: string }).message).toBe(message);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(signup.tenants.rows.map((t) => t.slug)).toEqual(['principal']);
      expect(signup.seeded).toEqual([]);
    },
  );

  it('answers 400 to a body that is not an object', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/api/signup')
      .set('Content-Type', 'application/json')
      .send('[1,2]');
    expect(res.status).toBe(400);
    expect(signup.tenants.rows).toHaveLength(1);
  });

  it('limits the signups of one IP to 5 per hour with a 429 in Spanish', async () => {
    for (let i = 0; i < 5; i++) {
      await post(body({ slug: `negocio-${i}` })).expect(201);
    }

    const sixth = await post(body({ slug: 'negocio-6' }));

    expect(sixth.status).toBe(429);
    expect((sixth.body as { message: string }).message).toBe(
      SIGNUP_RATE_LIMITED_MESSAGE,
    );
    expect(sixth.headers['set-cookie']).toBeUndefined();
    expect(signup.tenants.rows.map((t) => t.slug)).not.toContain('negocio-6');

    now += 60 * 60 * 1000 + 1;
    await post(body({ slug: 'negocio-7' })).expect(201);
  });

  it('counts the failed attempts too', async () => {
    for (let i = 0; i < 5; i++) await post(body({ email: 'bad' })).expect(400);
    await post().expect(429);
  });
});
