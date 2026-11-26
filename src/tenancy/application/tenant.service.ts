// ===== SERVICIO DE NEGOCIOS =====
// Resolves the business of a request and keeps it for a minute: the free
// tier of Atlas allows 100 operations per second, and the resolution happens
// on every request (spec 18).

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../shared/application/clock.port';
import { Result, err, ok } from '../../shared/domain/result';
import { Tenant } from '../domain/tenant';
import {
  DuplicateTenantSlug,
  InvalidTenantName,
  InvalidTenantSlug,
  ReservedTenantSlug,
  TenantNotFound,
  TenantSuspended,
} from '../domain/tenant.errors';
import {
  MAX_NAME_LENGTH,
  isReservedSlug,
  isValidName,
  isValidSlug,
  normalizeSlug,
} from '../domain/tenant.rules';
import {
  TENANT_READER,
  TENANT_WRITER,
  TenantReader,
  TenantWriter,
} from './ports/tenant.repository';

/** How long a resolved business is kept. */
export const TENANT_CACHE_TTL_MS = 60_000;

interface CachedTenant {
  tenant: Tenant;
  expiresAt: number;
}

/**
 * The businesses of the installation: which one a request belongs to and
 * which one is the default. It answers a `Result`: an unknown or suspended
 * business is a business failure, not an exception.
 */
@Injectable()
export class TenantService {
  private readonly cache = new Map<string, CachedTenant>();

  constructor(
    @Inject(TENANT_READER) private readonly reader: TenantReader,
    @Inject(TENANT_WRITER) private readonly writer: TenantWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Creates a new, active business that is not the default one. */
  async create(input: { slug: string; name: string }): Promise<Result<Tenant>> {
    const slug = normalizeSlug(input.slug);
    if (!isValidSlug(slug)) {
      return err(
        new InvalidTenantSlug(
          'El slug debe tener de 3 a 40 caracteres: letras minúsculas, números y guiones.',
        ),
      );
    }
    if (isReservedSlug(slug)) {
      return err(new ReservedTenantSlug(slug));
    }
    const name = input.name.trim();
    if (!isValidName(name)) {
      return err(
        new InvalidTenantName(
          `El nombre debe tener de 1 a ${MAX_NAME_LENGTH} caracteres.`,
        ),
      );
    }
    if (await this.reader.findBySlug(slug)) {
      return err(new DuplicateTenantSlug(slug));
    }
    const saved = await this.writer.insert({
      slug,
      name,
      status: 'active',
      isDefault: false,
      createdAt: this.clock.now(),
    });
    return ok(saved);
  }

  /** The business of a slug. Unknown or invalid: not found. */
  async resolve(slug: string): Promise<Result<Tenant>> {
    const normalized = normalizeSlug(slug);
    if (!isValidSlug(normalized)) {
      return err(new TenantNotFound());
    }
    const cached = this.cached(normalized);
    if (cached) {
      return this.answer(cached);
    }
    const found = await this.reader.findBySlug(normalized);
    if (!found) {
      return err(new TenantNotFound());
    }
    this.remember(normalized, found);
    return this.answer(found);
  }

  /** The business used when the request names none. */
  async resolveDefault(): Promise<Result<Tenant>> {
    const found = await this.reader.findDefault();
    if (!found) {
      return err(new TenantNotFound('No hay ningún negocio por defecto.'));
    }
    return this.answer(found);
  }

  /** A suspended business does not answer requests. */
  private answer(tenant: Tenant): Result<Tenant> {
    return tenant.status === 'suspended'
      ? err(new TenantSuspended())
      : ok(tenant);
  }

  private cached(slug: string): Tenant | undefined {
    const entry = this.cache.get(slug);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock.now().getTime()) {
      this.cache.delete(slug);
      return undefined;
    }
    return entry.tenant;
  }

  private remember(slug: string, tenant: Tenant): void {
    this.cache.set(slug, {
      tenant,
      expiresAt: this.clock.now().getTime() + TENANT_CACHE_TTL_MS,
    });
  }
}
