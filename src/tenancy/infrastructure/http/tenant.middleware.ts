// ===== MIDDLEWARE DE NEGOCIO =====
// The HTTP edge of the tenancy: it reads `X-Tenant`, resolves the business
// and runs the rest of the request inside its scope (spec 18).
//
//   - no header  -> the default business;
//   - a valid, existing and active business -> that one;
//   - an invalid or unknown slug -> 404 `Negocio no encontrado`;
//   - a suspended business -> 403 `Este negocio no está disponible.`.

import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  TENANT_SCOPE,
  TenantScope,
} from '../../../shared/application/tenant-context.port';
import { TenantService } from '../../application/tenant.service';

/** The header that names the business of a request. */
export const TENANT_HEADER = 'x-tenant';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenants: TenantService,
    @Inject(TENANT_SCOPE) private readonly scope: TenantScope,
  ) {}

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = request.headers[TENANT_HEADER];
    const slug = Array.isArray(header) ? header[0] : header;
    const resolved =
      slug && slug.trim() !== ''
        ? await this.tenants.resolve(slug)
        : await this.tenants.resolveDefault();
    if (!resolved.ok) {
      // The filter of the project turns it into the 404 or the 403.
      throw resolved.error;
    }
    const tenant = resolved.value;
    this.scope.run(
      { id: tenant.id, slug: tenant.slug, isDefault: tenant.isDefault },
      next,
    );
  }
}
