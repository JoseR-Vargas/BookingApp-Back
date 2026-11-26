import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { AdminUser } from '../../domain/admin-user';
import { AdminUserNotFoundError } from '../../domain/admin-user.errors';
import { validatePassword } from '../../domain/admin-user.rules';
import {
  ADMIN_SESSION_WRITER,
  AdminSessionWriter,
} from '../ports/admin-session.writer';
import { ADMIN_USER_WRITER, AdminUserWriter } from '../ports/admin-user.writer';
import { PASSWORD_HASHER, PasswordHasher } from '../ports/password-hasher.port';

/** Sets a new password for an account and revokes its open sessions. */
@Injectable()
export class RotateAdminPasswordUseCase {
  constructor(
    @Inject(ADMIN_USER_WRITER) private readonly writer: AdminUserWriter,
    @Inject(ADMIN_SESSION_WRITER) private readonly sessions: AdminSessionWriter,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async execute(id: string, password: unknown): Promise<Result<AdminUser>> {
    const valid = validatePassword(password);
    if (!valid.ok) return valid;
    const updated = await this.writer.update(id, {
      passwordHash: await this.hasher.hash(valid.value),
    });
    if (!updated) return err(new AdminUserNotFoundError());
    await this.sessions.revokeAllOfUser(id);
    return ok(updated);
  }
}
