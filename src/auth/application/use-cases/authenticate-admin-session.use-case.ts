import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { AdminUser } from '../../domain/admin-user';
import { InvalidSessionError } from '../../domain/admin-user.errors';
import { isSessionLive } from '../../domain/admin-user.rules';
import {
  ADMIN_SESSION_READER,
  AdminSessionReader,
} from '../ports/admin-session.reader';
import { ADMIN_USER_READER, AdminUserReader } from '../ports/admin-user.reader';
import { SESSION_TOKENS, SessionTokens } from '../ports/session-tokens.port';

/**
 * The account behind a session token, in the business in force. A token of
 * another business, an expired session or an inactive account all answer the
 * same `InvalidSessionError`.
 */
@Injectable()
export class AuthenticateAdminSessionUseCase {
  constructor(
    @Inject(ADMIN_SESSION_READER) private readonly sessions: AdminSessionReader,
    @Inject(ADMIN_USER_READER) private readonly users: AdminUserReader,
    @Inject(SESSION_TOKENS) private readonly tokens: SessionTokens,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<Result<AdminUser>> {
    const session = await this.sessions.findByTokenHash(
      this.tokens.hash(token),
    );
    if (!session || !isSessionLive(session, this.clock.now())) {
      return err(new InvalidSessionError());
    }
    const user = await this.users.findById(session.userId);
    if (!user || !user.active) return err(new InvalidSessionError());
    return ok(user);
  }
}
