// ===== URL PÚBLICA POR NEGOCIO =====
// The links of an email must lead to the business of the booking: the default
// business keeps the plain URL, every other one lives under `/n/<slug>`
// (spec 19). Without a business in the context the plain URL is used.

import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_CONTEXT,
  TenantContext,
} from '../../shared/application/tenant-context.port';
import { PublicAppUrl } from '../application/ports/public-app-url.port';
import { EnvPublicAppUrl } from './env-public-app-url';

@Injectable()
export class TenantPublicAppUrl implements PublicAppUrl {
  private readonly base = new EnvPublicAppUrl();

  constructor(
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
  ) {}

  read(): string | null {
    const url = this.base.read();
    if (url === null) return null;
    try {
      const tenant = this.context.current();
      return tenant.isDefault === false ? `${url}/n/${tenant.slug}` : url;
    } catch {
      return url;
    }
  }
}
