import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { AdminUser } from '../../domain/admin-user';
import { InvalidCredentialsError } from '../../domain/admin-user.errors';
import {
  MAX_PASSWORD_LENGTH,
  SESSION_TTL_MS,
  normalizeEmail,
} from '../../domain/admin-user.rules';
import {
  ADMIN_SESSION_WRITER,
  AdminSessionWriter,
} from '../ports/admin-session.writer';
import { ADMIN_USER_READER, AdminUserReader } from '../ports/admin-user.reader';
import { ADMIN_USER_WRITER, AdminUserWriter } from '../ports/admin-user.writer';
import { PASSWORD_HASHER, PasswordHasher } from '../ports/password-hasher.port';
import { SESSION_TOKENS, SessionTokens } from '../ports/session-tokens.port';

export interface LoginCommand {
  email: unknown;
  password: unknown;
  userAgent?: string;
}

/** What a successful login hands to the HTTP edge: the plain token goes in the cookie only. */
export interface LoginOutcome {
  user: AdminUser;
  token: string;
  expiresAt: Date;
}

/**
 * Opens a session for an email and password. Every failure (unknown email,
 * wrong password, inactive account, malformed input) is the same error and
 * does the same work, so neither the message nor the timing says which one.
 */
@Injectable()
export class LoginAdminUseCase {
  constructor(
    @Inject(ADMIN_USER_READER) private readonly users: AdminUserReader,
    @Inject(ADMIN_USER_WRITER) private readonly userWriter: AdminUserWriter,
    @Inject(ADMIN_SESSION_WRITER) private readonly sessions: AdminSessionWriter,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SESSION_TOKENS) private readonly tokens: SessionTokens,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: LoginCommand): Promise<Result<LoginOutcome>> {
    const email = normalizeEmail(command.email);
    const password =
      typeof command.password === 'string' &&
      command.password.length <= MAX_PASSWORD_LENGTH
        ? command.password
        : '';
    const found = email.ok
      ? await this.users.findCredentialsByEmail(email.value)
      : null;
    const matches = await this.hasher.verify(
      password,
      found?.passwordHash ?? null,
    );
    if (!found || !matches || !found.user.active) {
      return err(new InvalidCredentialsError());
    }

    const now = this.clock.now();
    const { token, tokenHash } = this.tokens.issue();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.sessions.create({
      userId: found.user.id,
      tokenHash,
      createdAt: now,
      expiresAt,
      userAgent: command.userAgent,
    });
    const user =
      (await this.userWriter.update(found.user.id, { lastLoginAt: now })) ??
      found.user;
    return ok({ user, token, expiresAt });
  }
}
