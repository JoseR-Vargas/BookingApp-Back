/**
 * Test-only wiring: the branding controllers over the in-memory adapter, the
 * same use cases and tokens as `branding.module.ts` with no database.
 */
import { Provider } from '@nestjs/common';
import { BRANDING_READER } from '../../application/ports/branding.reader';
import { BRANDING_WRITER } from '../../application/ports/branding.writer';
import { CLOCK } from '../../application/ports/clock.port';
import { DeleteLogoUseCase } from '../../application/use-cases/delete-logo.use-case';
import { GetBrandingUseCase } from '../../application/use-cases/get-branding.use-case';
import { GetLogoUseCase } from '../../application/use-cases/get-logo.use-case';
import { SaveBrandingUseCase } from '../../application/use-cases/save-branding.use-case';
import { SaveLogoUseCase } from '../../application/use-cases/save-logo.use-case';
import { InMemoryBrandingRepository } from '../persistence/in-memory/in-memory-branding.repository';
import { SystemClock } from '../system.clock';
import { BrandingAdminController } from './branding-admin.controller';
import { BrandingController } from './branding.controller';
import { PublicBranding } from './branding.presenter';

export const BRANDING_CONTROLLERS = [
  BrandingController,
  BrandingAdminController,
];

/** Binds every branding port to the in-memory adapter (the swap proof). */
export function inMemoryBrandingProviders(
  repository: InMemoryBrandingRepository,
): Provider[] {
  return [
    { provide: BRANDING_READER, useValue: repository },
    { provide: BRANDING_WRITER, useValue: repository },
    { provide: CLOCK, useClass: SystemClock },
    GetBrandingUseCase,
    GetLogoUseCase,
    SaveBrandingUseCase,
    SaveLogoUseCase,
    DeleteLogoUseCase,
  ];
}

/** Typed JSON body of a branding response (or an error body). */
export type BrandingResponseBody = PublicBranding & { message?: string };

export const bodyOf = (res: { body: unknown }): BrandingResponseBody =>
  res.body as BrandingResponseBody;
