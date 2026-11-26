import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  PUBLIC_RATE_LIMITER,
  RateLimiter,
} from '../../application/rate-limiter.port';

/** The message of a client that asks too often (spec 22). */
export const PUBLIC_RATE_LIMITED_MESSAGE =
  'Demasiadas peticiones. Intenta más tarde.';

/**
 * Limits the requests per IP on the public routes it decorates
 * (`/availability`, `/public-availability`, `POST /bookings`). Admin routes
 * and the WhatsApp webhook do not use it. The limiter is `@Optional` so a
 * module tested in isolation does not need it; `PublicRateLimitModule` binds
 * it in the application. Behind a proxy configure Express `trust proxy`, or
 * every client shares the proxy's IP.
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(PUBLIC_RATE_LIMITER)
    private readonly limiter?: RateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.limiter) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (!this.limiter.tryConsume(request.ip || 'unknown')) {
      throw new HttpException(
        PUBLIC_RATE_LIMITED_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
