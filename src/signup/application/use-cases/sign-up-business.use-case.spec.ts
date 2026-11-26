import { SignUpCommand } from './sign-up-business.use-case';
import { ProvisionBusinessUseCase } from './provision-business.use-case';
import { SignUpBusinessUseCase } from './sign-up-business.use-case';
import { TenantService } from '../../../tenancy/application/tenant.service';
import { CreateAdminUserUseCase } from '../../../auth/application/use-cases/create-admin-user.use-case';
import { LoginAdminUseCase } from '../../../auth/application/use-cases/login-admin.use-case';
import { AdminSessionWriter } from '../../../auth/application/ports/admin-session.writer';
import { buildSignup as build, clock, NOW } from '../../signup.testing';

const command = (over: Partial<SignUpCommand> = {}): SignUpCommand => ({
  businessName: 'Barbería Sur',
  adminName: 'Ana',
  email: 'ana@example.com',
  password: 'a-long-password',
  ...over,
});

describe('SignUpBusinessUseCase', () => {
  it('creates the business with its trial, its seed, its owner and a session', async () => {
    const app = build();

    const result = await app.useCase.execute(command({ userAgent: 'jest' }));

    if (!result.ok) throw new Error(result.error.message);
    const created = app.tenants.rows.find((t) => t.slug === 'barberia-sur')!;
    expect(created).toMatchObject({
      name: 'Barbería Sur',
      status: 'active',
      isDefault: false,
      createdAt: NOW,
      trialEndsAt: new Date('2026-12-09T10:00:00Z'),
      bookingQuota: 20,
    });
    expect(result.value.tenant).toEqual({
      slug: 'barberia-sur',
      name: 'Barbería Sur',
    });
    expect(result.value.user).toMatchObject({
      email: 'ana@example.com',
      name: 'Ana',
      role: 'owner',
      active: true,
    });
    expect(result.value.token).toHaveLength(43);
    expect(result.value.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(JSON.stringify(result.value)).not.toContain('h:a-long-password');
    expect(app.erased).toEqual([]);
  });

  it('seeds, creates the owner, opens the session and welcomes inside the new business', async () => {
    const app = build();

    const result = await app.useCase.execute(command());

    if (!result.ok) throw new Error(result.error.message);
    const id = app.tenants.rows.find((t) => t.slug === 'barberia-sur')!.id;
    expect(app.seeded).toEqual([id]);
    expect(app.welcome.sent).toEqual([
      {
        businessId: id,
        message: {
          to: 'ana@example.com',
          adminName: 'Ana',
          businessName: 'Barbería Sur',
        },
      },
    ]);
    // The owner and its session live in the new business, not in the default one.
    const inBusiness = <T>(tenantId: string, fn: () => Promise<T>) =>
      app.context.run({ id: tenantId, slug: 'x' }, fn);
    expect(
      await inBusiness(id, () =>
        app.users.findCredentialsByEmail('ana@example.com'),
      ),
    ).not.toBeNull();
    expect(
      await inBusiness('default', () =>
        app.users.findCredentialsByEmail('ana@example.com'),
      ),
    ).toBeNull();
  });

  it('the owner can open another session with the same password', async () => {
    const app = build();
    const result = await app.useCase.execute(command());
    expect(result.ok).toBe(true);
    const id = app.tenants.rows.find((t) => t.slug === 'barberia-sur')!.id;
    const found = await app.context.run({ id, slug: 'x' }, () =>
      app.users.findCredentialsByEmail('ana@example.com'),
    );
    expect(found?.passwordHash).toBe('h:a-long-password');
  });

  it('uses the typed slug', async () => {
    const app = build();
    const result = await app.useCase.execute(command({ slug: 'Mi-Local' }));
    expect(result.ok && result.value.tenant.slug).toBe('mi-local');
  });

  it.each([
    ['an invalid slug', { slug: 'a' }, /El slug debe tener de 3 a 40/],
    ['a reserved slug', { slug: 'admin' }, /está reservado/],
    ['a repeated slug', { slug: 'principal' }, /ya está en uso/],
    ['a bad email', { email: 'nope' }, /El correo no es válido/],
    ['a weak password', { password: 'short' }, /al menos 10 caracteres/],
    ['an empty business name', { businessName: ' ' }, /nombre del negocio/],
  ])('rejects %s and creates nothing', async (_name, over, message) => {
    const app = build();

    const result = await app.useCase.execute(command(over));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(message);
    expect(app.tenants.rows.map((t) => t.slug)).toEqual(['principal']);
    expect(app.erased).toEqual([]);
    expect(app.seeded).toEqual([]);
    expect(app.welcome.sent).toEqual([]);
  });

  describe('a failure after the business exists leaves nothing', () => {
    it('when the seed fails, it deletes the business and rethrows', async () => {
      const app = build();
      app.seeder.failWith = new Error('mongo down');

      await expect(app.useCase.execute(command())).rejects.toThrow(
        'mongo down',
      );

      expect(app.erased).toHaveLength(1);
      expect(app.tenants.rows.map((t) => t.slug)).toEqual(['principal']);
      expect(app.welcome.sent).toEqual([]);
    });

    it('when the session cannot be opened, it deletes the business', async () => {
      const app = build();
      app.sessionWriter.value = {
        create: () => Promise.reject(new Error('sessions down')),
      } as unknown as AdminSessionWriter;

      await expect(app.useCase.execute(command())).rejects.toThrow(
        'sessions down',
      );

      expect(app.erased).toHaveLength(1);
      expect(app.tenants.rows.map((t) => t.slug)).toEqual(['principal']);
      expect(app.welcome.sent).toEqual([]);
    });

    it('when the owner cannot be created (a business failure), it deletes the business and answers that failure', async () => {
      const app = build();
      jest.spyOn(app.users, 'create').mockResolvedValue(null); // "email taken"

      const result = await app.useCase.execute(command());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe(
          'Ya existe un usuario con ese correo.',
        );
      }
      expect(app.erased).toHaveLength(1);
      expect(app.tenants.rows.map((t) => t.slug)).toEqual(['principal']);
    });

    it('the undone signup can be repeated with the same slug', async () => {
      const app = build();
      app.seeder.failWith = new Error('seed failed');
      await expect(app.useCase.execute(command())).rejects.toThrow(
        'seed failed',
      );

      app.seeder.failWith = undefined;
      const again = await app.useCase.execute(command());

      expect(again.ok).toBe(true);
    });

    it('a cleanup that fails does not hide the original failure', async () => {
      const app = build();
      app.seeder.failWith = new Error('seed failed');
      const failing = new SignUpBusinessUseCase(
        new TenantService(app.tenants, app.tenants, clock),
        new ProvisionBusinessUseCase(
          app.seeder,
          { execute: jest.fn() } as unknown as CreateAdminUserUseCase,
          { execute: jest.fn() } as unknown as LoginAdminUseCase,
          app.welcome,
        ),
        app.context,
        { erase: () => Promise.reject(new Error('cleanup failed')) },
        clock,
      );

      await expect(failing.execute(command())).rejects.toThrow('seed failed');
    });
  });
});
