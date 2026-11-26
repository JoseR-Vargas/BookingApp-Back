import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { AdminUser } from '../../domain/admin-user';
import {
  AdminUserNotFoundError,
  LastOwnerError,
} from '../../domain/admin-user.errors';
import { validateRole, wouldLeaveNoOwner } from '../../domain/admin-user.rules';
import { ADMIN_USER_READER, AdminUserReader } from '../ports/admin-user.reader';
import { ADMIN_USER_WRITER, AdminUserWriter } from '../ports/admin-user.writer';

/** Changes the role of an account; the last active owner cannot be demoted. */
@Injectable()
export class ChangeAdminUserRoleUseCase {
  constructor(
    @Inject(ADMIN_USER_READER) private readonly reader: AdminUserReader,
    @Inject(ADMIN_USER_WRITER) private readonly writer: AdminUserWriter,
  ) {}

  async execute(id: string, role: unknown): Promise<Result<AdminUser>> {
    const valid = validateRole(role);
    if (!valid.ok) return valid;
    const target = await this.reader.findById(id);
    if (!target) return err(new AdminUserNotFoundError());
    const owners = await this.reader.countActiveOwners();
    if (wouldLeaveNoOwner(target, { role: valid.value }, owners)) {
      return err(new LastOwnerError());
    }
    const updated = await this.writer.update(id, { role: valid.value });
    return updated ? ok(updated) : err(new AdminUserNotFoundError());
  }
}
