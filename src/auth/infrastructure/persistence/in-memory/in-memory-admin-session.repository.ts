import { randomUUID } from 'node:crypto';
import { AdminSessionReader } from '../../../application/ports/admin-session.reader';
import { AdminSessionWriter } from '../../../application/ports/admin-session.writer';
import { AdminSession, NewAdminSession } from '../../../domain/admin-user';
import { TenantRows } from '../../../../shared/infrastructure/tenancy/tenant-partition';

const copy = (session: AdminSession): AdminSession => ({
  ...session,
  createdAt: new Date(session.createdAt),
  expiresAt: new Date(session.expiresAt),
});

/** Keeps the sessions in memory, one partition per business. */
export class InMemoryAdminSessionRepository
  implements AdminSessionReader, AdminSessionWriter
{
  private readonly rows = new TenantRows<AdminSession>();

  findByTokenHash(tokenHash: string): Promise<AdminSession | null> {
    const found = this.rows.find((s) => s.tokenHash === tokenHash);
    return Promise.resolve(found ? copy(found) : null);
  }

  create(input: NewAdminSession): Promise<AdminSession> {
    const session: AdminSession = { id: randomUUID(), ...input };
    this.rows.add(copy(session));
    return Promise.resolve(copy(session));
  }

  revokeByTokenHash(tokenHash: string): Promise<void> {
    this.rows.remove((s) => s.tokenHash === tokenHash);
    return Promise.resolve();
  }

  revokeAllOfUser(userId: string): Promise<void> {
    this.rows.remove((s) => s.userId === userId);
    return Promise.resolve();
  }
}
