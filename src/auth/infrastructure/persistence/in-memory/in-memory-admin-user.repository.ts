import { randomUUID } from 'node:crypto';
import { AdminUserReader } from '../../../application/ports/admin-user.reader';
import { AdminUserWriter } from '../../../application/ports/admin-user.writer';
import {
  AdminCredentialsRecord,
  AdminUser,
  AdminUserChanges,
  NewAdminUser,
} from '../../../domain/admin-user';
import { TenantRows } from '../../../../shared/infrastructure/tenancy/tenant-partition';

interface Row {
  user: AdminUser;
  passwordHash: string;
}

const copy = (user: AdminUser): AdminUser => ({
  ...user,
  createdAt: new Date(user.createdAt),
  lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
});

/**
 * Keeps the accounts in memory, one partition per business. It honors the
 * same contract as the MongoDB adapter; use-case and HTTP tests run on it.
 */
export class InMemoryAdminUserRepository
  implements AdminUserReader, AdminUserWriter
{
  private readonly rows = new TenantRows<Row>();

  findById(id: string): Promise<AdminUser | null> {
    const row = this.rows.find((r) => r.user.id === id);
    return Promise.resolve(row ? copy(row.user) : null);
  }

  findCredentialsByEmail(
    email: string,
  ): Promise<AdminCredentialsRecord | null> {
    const row = this.rows.find((r) => r.user.email === email);
    return Promise.resolve(
      row ? { user: copy(row.user), passwordHash: row.passwordHash } : null,
    );
  }

  list(): Promise<AdminUser[]> {
    return Promise.resolve(
      this.rows
        .all()
        .map((row) => copy(row.user))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }

  countActiveOwners(): Promise<number> {
    return Promise.resolve(
      this.rows.filter((r) => r.user.role === 'owner' && r.user.active).length,
    );
  }

  create(input: NewAdminUser): Promise<AdminUser | null> {
    if (this.rows.find((r) => r.user.email === input.email)) {
      return Promise.resolve(null);
    }
    const user: AdminUser = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      role: input.role,
      active: true,
      createdAt: new Date(input.createdAt),
      lastLoginAt: null,
    };
    this.rows.add({ user, passwordHash: input.passwordHash });
    return Promise.resolve(copy(user));
  }

  update(id: string, changes: AdminUserChanges): Promise<AdminUser | null> {
    const row = this.rows.find((r) => r.user.id === id);
    if (!row) return Promise.resolve(null);
    const { passwordHash, ...fields } = changes;
    row.user = copy({ ...row.user, ...definedOnly(fields) });
    if (passwordHash !== undefined) row.passwordHash = passwordHash;
    return Promise.resolve(copy(row.user));
  }
}

const definedOnly = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
