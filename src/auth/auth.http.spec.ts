import { Server } from 'node:http';
import {
  Controller,
  Delete,
  Get,
  INestApplication,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';
import { DomainErrorFilter } from '../shared/infrastructure/http/domain-error.filter';
import { tenantScopeStorage } from '../shared/infrastructure/tenancy/tenant-scope.storage';
import { AdminKeyGuard } from './admin-key.guard';
import { AUTH_CONTROLLERS, inMemoryAuthProviders } from './auth-http.testing';
import { CreateAdminUserUseCase } from './application/use-cases/create-admin-user.use-case';
import { Roles } from './infrastructure/http/roles.decorator';
import { InMemoryAdminSessionRepository } from './infrastructure/persistence/in-memory/in-memory-admin-session.repository';
import { InMemoryAdminUserRepository } from './infrastructure/persistence/in-memory/in-memory-admin-user.repository';

/** Routes with each flavour of role rule, behind the real guard. */
@Controller('probe')
@UseGuards(AdminKeyGuard)
class ProbeController {
  @Get()
  read() {
    return { ok: 'read' };
  }

  @Post()
  writeByDefault() {
    return { ok: 'default-write' };
  }

  @Patch()
  @Roles('staff', 'owner')
  staffWrite() {
    return { ok: 'staff-write' };
  }

  @Delete()
  @Roles('owner')
  ownerOnly() {
    return { ok: 'owner-only' };
  }
}

const KEY = 'legacy-key';
const PASSWORD = 'a-long-password';
const FORBIDDEN = 'No tienes permiso para realizar esta acción.';

describe('Admin accounts over HTTP (in-memory adapters)', () => {
  let app: INestApplication;
  let now: Date;
  let savedKey: string | undefined;
  let savedDisabled: string | undefined;

  const server = () => request(app.getHttpServer() as Server);

  /** Creates an account in a business, like the bootstrap script does. */
  const seed = async (
    business: string,
    email: string,
    role: 'owner' | 'staff' | 'viewer',
  ) => {
    const created = await tenantScopeStorage.run(
      { tenantId: business, slug: business },
      () =>
        app.get(CreateAdminUserUseCase).execute({
          email,
          name: email.split('@')[0],
          password: PASSWORD,
          role,
        }),
    );
    if (!created.ok) throw new Error(created.error.message);
    return created.value;
  };

  /** Logs in and answers the cookie header to send back. */
  const login = async (
    email: string,
    business = 'biz-a',
    password = PASSWORD,
  ): Promise<string> => {
    const res = await server()
      .post('/api/admin/session')
      .set('X-Tenant', business)
      .send({ email, password })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return cookies[0].split(';')[0];
  };

  beforeEach(async () => {
    savedKey = process.env.ADMIN_API_KEY;
    savedDisabled = process.env.ADMIN_KEY_DISABLED_TENANTS;
    process.env.ADMIN_API_KEY = KEY;
    delete process.env.ADMIN_KEY_DISABLED_TENANTS;
    now = new Date();
    const moduleRef = await Test.createTestingModule({
      controllers: [...AUTH_CONTROLLERS, ProbeController],
      providers: inMemoryAuthProviders(
        new InMemoryAdminUserRepository(),
        new InMemoryAdminSessionRepository(),
        { now: () => now },
      ),
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const business = String(req.headers['x-tenant'] ?? 'biz-a');
      tenantScopeStorage.run({ tenantId: business, slug: business }, next);
    });
    app.useGlobalFilters(new DomainErrorFilter());
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (savedKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = savedKey;
    if (savedDisabled === undefined)
      delete process.env.ADMIN_KEY_DISABLED_TENANTS;
    else process.env.ADMIN_KEY_DISABLED_TENANTS = savedDisabled;
  });

  describe('login, status and logout', () => {
    it('logs in with email and password and sets an HttpOnly, SameSite=Lax cookie', async () => {
      const owner = await seed('biz-a', 'ana@example.com', 'owner');
      const res = await server()
        .post('/api/admin/session')
        .send({ email: 'Ana@Example.com', password: PASSWORD })
        .expect(200);
      expect(res.body).toEqual({
        ok: true,
        user: {
          id: owner.id,
          email: 'ana@example.com',
          name: 'ana',
          role: 'owner',
          active: true,
          createdAt: owner.createdAt.toISOString(),
          lastLoginAt: now.toISOString(),
        },
      });
      const [cookie] = res.headers['set-cookie'] as unknown as string[];
      expect(cookie).toMatch(/^admin_session=[A-Za-z0-9_-]{43};/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Secure');
      const expires = /Expires=([^;]+)/.exec(cookie)?.[1] as string;
      expect(new Date(expires).getTime()).toBeGreaterThan(
        now.getTime() + 6.9 * 24 * 3600 * 1000,
      );
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|token/i);
    });

    it('marks the cookie Secure in production', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      const saved = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await server()
          .post('/api/admin/session')
          .send({ email: 'ana@example.com', password: PASSWORD })
          .expect(200);
        const [cookie] = res.headers['set-cookie'] as unknown as string[];
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('HttpOnly');
      } finally {
        process.env.NODE_ENV = saved;
      }
    });

    it('GET /session answers the account for a session and { ok: true } for the key', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      const cookie = await login('ana@example.com');
      const withSession = await server()
        .get('/api/admin/session')
        .set('Cookie', cookie)
        .expect(200);
      expect(withSession.body).toMatchObject({
        ok: true,
        user: { email: 'ana@example.com', role: 'owner' },
      });
      expect(JSON.stringify(withSession.body)).not.toMatch(
        /passwordHash|token/i,
      );

      const withKey = await server()
        .get('/api/admin/session')
        .set('Authorization', `Bearer ${KEY}`)
        .expect(200);
      expect(withKey.body).toEqual({ ok: true });

      await server().get('/api/admin/session').expect(401);
    });

    it('survives a reload: the same cookie keeps working', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      const cookie = await login('ana@example.com');
      for (let i = 0; i < 2; i++) {
        await server()
          .get('/api/admin/session')
          .set('Cookie', cookie)
          .expect(200);
      }
    });

    it('logs out: the cookie is cleared and the token stops working', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      const cookie = await login('ana@example.com');
      const res = await server()
        .delete('/api/admin/session')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual({ ok: true });
      const [cleared] = res.headers['set-cookie'] as unknown as string[];
      expect(cleared).toMatch(/^admin_session=;/);
      await server()
        .get('/api/admin/session')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('logging out without a session is still a 200', async () => {
      await server().delete('/api/admin/session').expect(200);
    });

    it('rejects an expired session with 401', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      const cookie = await login('ana@example.com');
      now = new Date(now.getTime() + 7 * 24 * 3600 * 1000 + 1000);
      await server()
        .get('/api/admin/session')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('rejects a forged or garbage cookie with the usual 401', async () => {
      const res = await server()
        .get('/api/admin/session')
        .set('Cookie', 'admin_session=forged; other=1')
        .expect(401);
      expect(res.body).toMatchObject({
        message: 'Invalid or missing admin key',
      });
    });
  });

  describe('failed login', () => {
    it('answers the same 401 for an unknown email, a wrong password and an inactive account', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      const staff = await seed('biz-a', 'sam@example.com', 'staff');
      const ownerCookie = await login('ana@example.com');
      await server()
        .post(`/api/admin/users/${staff.id}/deactivate`)
        .set('Cookie', ownerCookie)
        .expect(201);

      const attempts = [
        { email: 'nobody@example.com', password: PASSWORD },
        { email: 'ana@example.com', password: 'wrong-password-1' },
        { email: 'sam@example.com', password: PASSWORD },
        { email: 'not-an-email', password: PASSWORD },
        { email: 'ana@example.com' },
      ];
      const bodies: unknown[] = [];
      for (const attempt of attempts) {
        const res = await server()
          .post('/api/admin/session')
          .send(attempt)
          .expect(401);
        expect(res.headers['set-cookie']).toBeUndefined();
        bodies.push(res.body);
      }
      expect(bodies[0]).toEqual({
        message: 'Correo o contraseña incorrectos',
        error: 'Unauthorized',
        statusCode: 401,
      });
      for (const body of bodies) expect(body).toEqual(bodies[0]);
    });

    it('answers 401 (not 400 or 500) to a body that is not an object', async () => {
      await server()
        .post('/api/admin/session')
        .set('Content-Type', 'application/json')
        .send('[1,2]')
        .expect(401);
    });
  });

  describe('roles', () => {
    const matrix: [
      string,
      string,
      'owner' | 'staff' | 'viewer' | 'key',
      number,
    ][] = [
      // route, method, role, status
      ['read', 'get', 'owner', 200],
      ['read', 'get', 'staff', 200],
      ['read', 'get', 'viewer', 200],
      ['read', 'get', 'key', 200],
      ['default write', 'post', 'owner', 201],
      ['default write', 'post', 'staff', 403],
      ['default write', 'post', 'viewer', 403],
      ['default write', 'post', 'key', 201],
      ['staff write', 'patch', 'owner', 200],
      ['staff write', 'patch', 'staff', 200],
      ['staff write', 'patch', 'viewer', 403],
      ['staff write', 'patch', 'key', 200],
      ['owner only', 'delete', 'owner', 200],
      ['owner only', 'delete', 'staff', 403],
      ['owner only', 'delete', 'viewer', 403],
      ['owner only', 'delete', 'key', 200],
    ];

    it.each(matrix)(
      '%s (%s) as %s -> %i',
      async (_route, method, role, status) => {
        await seed('biz-a', 'owner@example.com', 'owner');
        await seed('biz-a', 'staff@example.com', 'staff');
        await seed('biz-a', 'viewer@example.com', 'viewer');
        const call =
          server()[method as 'get' | 'post' | 'patch' | 'delete']('/api/probe');
        const res = await (role === 'key'
          ? call.set('Authorization', `Bearer ${KEY}`)
          : call.set('Cookie', await login(`${role}@example.com`)));
        expect(res.status).toBe(status);
        if (status === 403) {
          expect(res.body).toMatchObject({
            message: FORBIDDEN,
            statusCode: 403,
          });
        }
      },
    );

    it('answers 401 without credentials, never 403', async () => {
      await server().get('/api/probe').expect(401);
      await server().delete('/api/probe').expect(401);
    });

    it('takes a role change into effect on the next request', async () => {
      const owner = await seed('biz-a', 'owner@example.com', 'owner');
      const staff = await seed('biz-a', 'staff@example.com', 'staff');
      const ownerCookie = await login('owner@example.com');
      const staffCookie = await login('staff@example.com');
      await server().post('/api/probe').set('Cookie', staffCookie).expect(403);
      await server()
        .patch(`/api/admin/users/${staff.id}/role`)
        .set('Cookie', ownerCookie)
        .send({ role: 'owner' })
        .expect(200);
      await server().post('/api/probe').set('Cookie', staffCookie).expect(201);
      expect(owner.role).toBe('owner');
    });
  });

  describe('the legacy key', () => {
    it('keeps working as an owner while the business has not turned it off', async () => {
      await server()
        .get('/api/probe')
        .set('Authorization', `Bearer ${KEY}`)
        .expect(200);
      await server()
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${KEY}`)
        .expect(200);
    });

    it('can be turned off for one business with ADMIN_KEY_DISABLED_TENANTS', async () => {
      process.env.ADMIN_KEY_DISABLED_TENANTS = 'biz-b, other';
      await server()
        .get('/api/probe')
        .set('X-Tenant', 'biz-b')
        .set('Authorization', `Bearer ${KEY}`)
        .expect(401);
      await server()
        .get('/api/probe')
        .set('X-Tenant', 'biz-a')
        .set('Authorization', `Bearer ${KEY}`)
        .expect(200);
      await seed('biz-b', 'bea@example.com', 'owner');
      const cookie = await login('bea@example.com', 'biz-b');
      await server()
        .get('/api/probe')
        .set('X-Tenant', 'biz-b')
        .set('Cookie', cookie)
        .expect(200);
    });
  });

  describe('one business per account', () => {
    it('the same email in two businesses is two accounts', async () => {
      const a = await seed('biz-a', 'ana@example.com', 'owner');
      const b = await seed('biz-b', 'ana@example.com', 'owner');
      expect(a.id).not.toBe(b.id);
      await login('ana@example.com', 'biz-a');
      await login('ana@example.com', 'biz-b');
    });

    it('the session token of one business is worthless in another', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      await seed('biz-b', 'bea@example.com', 'owner');
      const cookieA = await login('ana@example.com', 'biz-a');
      await server()
        .get('/api/probe')
        .set('X-Tenant', 'biz-a')
        .set('Cookie', cookieA)
        .expect(200);
      await server()
        .get('/api/probe')
        .set('X-Tenant', 'biz-b')
        .set('Cookie', cookieA)
        .expect(401);
      await server()
        .get('/api/admin/users')
        .set('X-Tenant', 'biz-b')
        .set('Cookie', cookieA)
        .expect(401);
    });

    it('a password of one business does not open another', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      await server()
        .post('/api/admin/session')
        .set('X-Tenant', 'biz-b')
        .send({ email: 'ana@example.com', password: PASSWORD })
        .expect(401);
    });

    it('the user list only shows the accounts of the business', async () => {
      await seed('biz-a', 'ana@example.com', 'owner');
      await seed('biz-b', 'bea@example.com', 'owner');
      const res = await server()
        .get('/api/admin/users')
        .set('X-Tenant', 'biz-a')
        .set('Authorization', `Bearer ${KEY}`)
        .expect(200);
      expect((res.body as { email: string }[]).map((u) => u.email)).toEqual([
        'ana@example.com',
      ]);
    });
  });

  describe('user administration (owner only)', () => {
    let ownerCookie: string;

    beforeEach(async () => {
      await seed('biz-a', 'owner@example.com', 'owner');
      ownerCookie = await login('owner@example.com');
    });

    it('lists the accounts without secrets', async () => {
      await seed('biz-a', 'staff@example.com', 'staff');
      const res = await server()
        .get('/api/admin/users')
        .set('Cookie', ownerCookie)
        .expect(200);
      expect((res.body as unknown[]).length).toBe(2);
      expect(Object.keys((res.body as object[])[0]).sort()).toEqual([
        'active',
        'createdAt',
        'email',
        'id',
        'lastLoginAt',
        'name',
        'role',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|token|scrypt/i,
      );
    });

    it('creates an account that can then log in', async () => {
      const res = await server()
        .post('/api/admin/users')
        .set('Cookie', ownerCookie)
        .send({
          email: 'New@Example.com',
          name: 'New',
          password: PASSWORD,
          role: 'staff',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        email: 'new@example.com',
        role: 'staff',
        active: true,
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|token|scrypt/i,
      );
      await login('new@example.com');
    });

    it('rejects invalid data with 400 and a Spanish message, and a repeated email with 409', async () => {
      const short = await server()
        .post('/api/admin/users')
        .set('Cookie', ownerCookie)
        .send({
          email: 'x@example.com',
          name: 'X',
          password: 'short',
          role: 'staff',
        })
        .expect(400);
      expect(short.body).toMatchObject({
        message: 'La contraseña debe tener al menos 10 caracteres.',
      });
      const taken = await server()
        .post('/api/admin/users')
        .set('Cookie', ownerCookie)
        .send({
          email: 'owner@example.com',
          name: 'X',
          password: PASSWORD,
          role: 'staff',
        })
        .expect(409);
      expect(taken.body).toMatchObject({
        message: 'Ya existe un usuario con ese correo.',
      });
      await server()
        .post('/api/admin/users')
        .set('Cookie', ownerCookie)
        .send([1])
        .expect(400);
      await server()
        .get('/api/admin/users')
        .set('Cookie', ownerCookie)
        .expect(200)
        .expect((res) => expect((res.body as unknown[]).length).toBe(1));
    });

    it('changes a role', async () => {
      const staff = await seed('biz-a', 'staff@example.com', 'staff');
      const res = await server()
        .patch(`/api/admin/users/${staff.id}/role`)
        .set('Cookie', ownerCookie)
        .send({ role: 'viewer' })
        .expect(200);
      expect(res.body).toMatchObject({ id: staff.id, role: 'viewer' });
      await server()
        .patch(`/api/admin/users/${staff.id}/role`)
        .set('Cookie', ownerCookie)
        .send({ role: 'god' })
        .expect(400);
      await server()
        .patch('/api/admin/users/nope/role')
        .set('Cookie', ownerCookie)
        .send({ role: 'staff' })
        .expect(404);
    });

    it('deactivates an account: its session dies and it cannot log in again', async () => {
      const staff = await seed('biz-a', 'staff@example.com', 'staff');
      const staffCookie = await login('staff@example.com');
      const res = await server()
        .post(`/api/admin/users/${staff.id}/deactivate`)
        .set('Cookie', ownerCookie)
        .expect(201);
      expect(res.body).toMatchObject({ active: false });
      await server()
        .get('/api/admin/session')
        .set('Cookie', staffCookie)
        .expect(401);
      await server()
        .post('/api/admin/session')
        .send({ email: 'staff@example.com', password: PASSWORD })
        .expect(401);
    });

    it('rotates a password: the old one stops working and sessions are revoked', async () => {
      const staff = await seed('biz-a', 'staff@example.com', 'staff');
      const staffCookie = await login('staff@example.com');
      await server()
        .put(`/api/admin/users/${staff.id}/password`)
        .set('Cookie', ownerCookie)
        .send({ password: 'brand-new-password' })
        .expect(200);
      await server()
        .get('/api/admin/session')
        .set('Cookie', staffCookie)
        .expect(401);
      await server()
        .post('/api/admin/session')
        .send({ email: 'staff@example.com', password: PASSWORD })
        .expect(401);
      await login('staff@example.com', 'biz-a', 'brand-new-password');
      await server()
        .put(`/api/admin/users/${staff.id}/password`)
        .set('Cookie', ownerCookie)
        .send({ password: 'short' })
        .expect(400);
    });

    it('never lets the last active owner be demoted or deactivated (409)', async () => {
      const list = await server()
        .get('/api/admin/users')
        .set('Cookie', ownerCookie)
        .expect(200);
      const owner = (list.body as { id: string }[])[0];
      const message =
        'Debe quedar al menos un propietario activo en el negocio.';
      const demote = await server()
        .patch(`/api/admin/users/${owner.id}/role`)
        .set('Cookie', ownerCookie)
        .send({ role: 'staff' })
        .expect(409);
      expect(demote.body).toMatchObject({ message });
      const off = await server()
        .post(`/api/admin/users/${owner.id}/deactivate`)
        .set('Cookie', ownerCookie)
        .expect(409);
      expect(off.body).toMatchObject({ message });
      await server()
        .get('/api/admin/session')
        .set('Cookie', ownerCookie)
        .expect(200);
    });

    it.each(['staff', 'viewer'] as const)(
      'is closed to a %s with 403 on every endpoint',
      async (role) => {
        const target = await seed('biz-a', 'target@example.com', 'staff');
        await seed('biz-a', `${role}@example.com`, role);
        const cookie = await login(`${role}@example.com`);
        const calls = [
          () => server().get('/api/admin/users'),
          () => server().post('/api/admin/users').send({}),
          () =>
            server()
              .patch(`/api/admin/users/${target.id}/role`)
              .send({ role: 'owner' }),
          () => server().post(`/api/admin/users/${target.id}/deactivate`),
          () =>
            server()
              .put(`/api/admin/users/${target.id}/password`)
              .send({ password: 'brand-new-password' }),
        ];
        for (const call of calls) {
          const res = await call().set('Cookie', cookie);
          expect(res.status).toBe(403);
          expect(res.body).toMatchObject({ message: FORBIDDEN });
        }
      },
    );
  });
});
