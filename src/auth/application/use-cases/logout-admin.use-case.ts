import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import {
  ADMIN_SESSION_WRITER,
  AdminSessionWriter,
} from '../ports/admin-session.writer';
import { SESSION_TOKENS, SessionTokens } from '../ports/session-tokens.port';

/** Revokes the session of a token. An unknown token is not an error: the end state is the same. */
@Injectable()
export class LogoutAdminUseCase {
  constructor(
    @Inject(ADMIN_SESSION_WRITER) private readonly sessions: AdminSessionWriter,
    @Inject(SESSION_TOKENS) private readonly tokens: SessionTokens,
  ) {}

  async execute(token: string): Promise<Result<true>> {
    await this.sessions.revokeByTokenHash(this.tokens.hash(token));
    return ok(true);
  }
}
