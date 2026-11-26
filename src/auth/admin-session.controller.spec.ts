import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from './admin-key.guard';
import { ok } from '../shared/domain/result';
import { GetTrialStatusUseCase } from '../tenancy/application/use-cases/get-trial-status.use-case';
import { TrialStatus } from '../tenancy/domain/trial.rules';
import { AdminSessionController } from './admin-session.controller';
import { AdminUser } from './domain/admin-user';

const user: AdminUser = {
  id: 'u1',
  email: 'ana@example.com',
  name: 'Ana',
  role: 'owner',
  active: true,
  createdAt: new Date('2026-11-25T10:00:00Z'),
  lastLoginAt: null,
};

const trialOf = (status: TrialStatus | null) =>
  ({ execute: () => Promise.resolve(ok(status)) }) as GetTrialStatusUseCase;

describe('AdminSessionController', () => {
  it('answers { ok: true } on GET /admin/session', () => {
    expect(new AdminSessionController().getSession()).toEqual({ ok: true });
  });

  it('keeps the key answer exactly { ok: true }, with no trial lookup', () => {
    const execute = jest.fn();
    const trial = { execute } as unknown as GetTrialStatusUseCase;
    const controller = new AdminSessionController(trial);
    expect(
      controller.getSession({ headers: {}, adminActor: { kind: 'key' } }),
    ).toEqual({ ok: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('answers trial: null for an account of a business without a trial', async () => {
    const controller = new AdminSessionController(trialOf(null));
    await expect(
      controller.getSession({
        headers: {},
        adminActor: { kind: 'session', user },
      }),
    ).resolves.toEqual({
      ok: true,
      user: expect.objectContaining({ id: 'u1', role: 'owner' }) as unknown,
      trial: null,
    });
  });

  it('answers the state of the trial for an account', async () => {
    const endsAt = new Date('2026-12-09T10:00:00Z');
    const controller = new AdminSessionController(
      trialOf({
        endsAt,
        daysLeft: 14,
        bookingsMade: 3,
        bookingQuota: 20,
        blocked: false,
      }),
    );
    const body = await controller.getSession({
      headers: {},
      adminActor: { kind: 'session', user },
    });
    expect(body).toMatchObject({
      ok: true,
      trial: {
        endsAt: endsAt.toISOString(),
        daysLeft: 14,
        bookingsMade: 3,
        bookingQuota: 20,
        blocked: false,
      },
    });
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('is protected by AdminKeyGuard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminSessionController),
    ).toEqual([AdminKeyGuard]);
  });

  it('is mounted under /admin/session', () => {
    expect(Reflect.getMetadata('path', AdminSessionController)).toBe('admin');
    expect(
      Reflect.getMetadata('path', AdminSessionController.prototype.getSession),
    ).toBe('session');
  });
});
