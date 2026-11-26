import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { AdminUser } from '../../domain/admin-user';
import { AdminEmailTakenError } from '../../domain/admin-user.errors';
import {
  NewAdminUserDraft,
  validateNewAdminUser,
} from '../../domain/admin-user.rules';
import { ADMIN_USER_WRITER, AdminUserWriter } from '../ports/admin-user.writer';
import { PASSWORD_HASHER, PasswordHasher } from '../ports/password-hasher.port';

/** Creates an account in the business in force. Also the bootstrap of the first owner. */
@Injectable()
export class CreateAdminUserUseCase {
  constructor(
    @Inject(ADMIN_USER_WRITER) private readonly users: AdminUserWriter,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(draft: NewAdminUserDraft): Promise<Result<AdminUser>> {
    const valid = validateNewAdminUser(draft);
    if (!valid.ok) return valid;
    const created = await this.users.create({
      email: valid.value.email,
      name: valid.value.name,
      role: valid.value.role,
      passwordHash: await this.hasher.hash(valid.value.password),
      createdAt: this.clock.now(),
    });
    return created ? ok(created) : err(new AdminEmailTakenError());
  }
}
