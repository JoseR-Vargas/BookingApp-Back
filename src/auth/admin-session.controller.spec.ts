import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from './admin-key.guard';
import { AdminSessionController } from './admin-session.controller';

describe('AdminSessionController', () => {
  it('answers { ok: true } on GET /admin/session', () => {
    expect(new AdminSessionController().getSession()).toEqual({ ok: true });
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
