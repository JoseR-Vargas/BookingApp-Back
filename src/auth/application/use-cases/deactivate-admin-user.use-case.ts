import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { AdminUser } from '../../domain/admin-user';
import {
  AdminUserNotFoundError,
  LastOwnerError,
} from '../../domain/admin-user.errors';
import { wouldLeaveNoOwner } from '../../domain/admin-user.rules';
import {
  ADMIN_SESSION_WRITER,
  AdminSessionWriter,
} from '../ports/admin-session.writer';
import { ADMIN_USER_READER, AdminUserReader } from '../ports/admin-user.reader';
import { ADMIN_USER_WRITER, AdminUserWriter } from '../ports/admin-user.writer';

/** Deactivates an account and revokes its sessions; the last active owner cannot be deactivated. */
@Injectable()
export class DeactivateAdminUserUseCase {
  constructor(
    @Inject(ADMIN_USER_READER) private readonly reader: AdminUserReader,
    @Inject(ADMIN_USER_WRITER) private readonly writer: AdminUserWriter,
    @Inject(ADMIN_SESSION_WRITER) private readonly sessions: AdminSessionWriter,
  ) {}

  async execute(id: string): Promise<Result<AdminUser>> {
    const target = await this.reader.findById(id);
    if (!target) return err(new AdminUserNotFoundError());
    const owners = await this.reader.countActiveOwners();
    if (wouldLeaveNoOwner(target, { active: false }, owners)) {
      return err(new LastOwnerError());
    }
    const updated = await this.writer.update(id, { active: false });
    if (!updated) return err(new AdminUserNotFoundError());
    await this.sessions.revokeAllOfUser(id);
    return ok(updated);
  }
}
