import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { LoginAdminUseCase } from '../../application/use-cases/login-admin.use-case';
import { LogoutAdminUseCase } from '../../application/use-cases/logout-admin.use-case';
import { PublicAdminUser, toPublicAdminUser } from './admin-user.presenter';
import { parseLoginInput } from './admin-user.input';
import { respondAuth } from './respond-auth';
import {
  SESSION_COOKIE,
  readSessionToken,
  sessionCookieOptions,
} from './session-cookie';

const MAX_USER_AGENT = 200;

/**
 * Login and logout. They are the only admin routes without the guard: the
 * first one is how a session starts, and the second works with whatever
 * cookie the browser holds.
 */
@Controller('admin/session')
export class AdminLoginController {
  constructor(
    private readonly login: LoginAdminUseCase,
    private readonly logout: LogoutAdminUseCase,
  ) {}

  @Post()
  @HttpCode(200)
  async enter(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true; user: PublicAdminUser }> {
    const outcome = respondAuth(
      await this.login.execute({
        ...parseLoginInput(body),
        userAgent: userAgent?.slice(0, MAX_USER_AGENT),
      }),
    );
    response.cookie(
      SESSION_COOKIE,
      outcome.token,
      sessionCookieOptions(outcome.expiresAt),
    );
    return { ok: true, user: toPublicAdminUser(outcome.user) };
  }

  @Delete()
  async leave(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const token = readSessionToken(cookie);
    if (token) await this.logout.execute(token);
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { ok: true };
  }
}
