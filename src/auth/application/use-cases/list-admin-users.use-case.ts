import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { AdminUser } from '../../domain/admin-user';
import { ADMIN_USER_READER, AdminUserReader } from '../ports/admin-user.reader';

@Injectable()
export class ListAdminUsersUseCase {
  constructor(
    @Inject(ADMIN_USER_READER) private readonly users: AdminUserReader,
  ) {}

  async execute(): Promise<Result<AdminUser[]>> {
    return ok(await this.users.list());
  }
}
