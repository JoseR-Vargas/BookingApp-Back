import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PublicAdminUser,
  toPublicAdminUser,
} from '../../../auth/infrastructure/http/admin-user.presenter';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../../../auth/infrastructure/http/session-cookie';
import { respond } from '../../../shared/infrastructure/http/respond';
import {
  SIGNUP_RATE_LIMITER,
  SignupRateLimiter,
} from '../../application/ports/signup-rate-limiter.port';
import { SignUpBusinessUseCase } from '../../application/use-cases/sign-up-business.use-case';
import { parseSignupInput } from './signup.input';

const MAX_USER_AGENT = 200;

/** The message of a client that signs up too often. */
export const SIGNUP_RATE_LIMITED_MESSAGE =
  'Demasiados intentos de alta desde esta conexión. Inténtalo de nuevo más tarde.';

/**
 * The public door of the self-service signup (spec 21). It has no guard and
 * no `X-Tenant`: the business does not exist until this request creates it
 * (`TenancyModule` exempts the route from the tenant middleware).
 */
@Controller('signup')
export class SignupController {
  constructor(
    private readonly signUp: SignUpBusinessUseCase,
    @Inject(SIGNUP_RATE_LIMITER) private readonly limiter: SignupRateLimiter,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    ok: true;
    tenant: { slug: string; name: string };
    user: PublicAdminUser;
  }> {
    if (!this.limiter.tryConsume(ip || 'unknown')) {
      throw new HttpException(
        SIGNUP_RATE_LIMITED_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const outcome = respond(
      await this.signUp.execute({
        ...parseSignupInput(body),
        userAgent: userAgent?.slice(0, MAX_USER_AGENT),
      }),
    );
    response.cookie(
      SESSION_COOKIE,
      outcome.token,
      sessionCookieOptions(outcome.expiresAt),
    );
    return {
      ok: true,
      tenant: outcome.tenant,
      user: toPublicAdminUser(outcome.user),
    };
  }
}
