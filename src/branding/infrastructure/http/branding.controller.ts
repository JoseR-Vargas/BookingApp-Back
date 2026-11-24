import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { respond } from '../../../shared/infrastructure/http/respond';
import { GetBrandingUseCase } from '../../application/use-cases/get-branding.use-case';
import { GetLogoUseCase } from '../../application/use-cases/get-logo.use-case';
import { PublicBranding, toPublicBranding } from './branding.presenter';

/**
 * The logo URL carries `?v=<updatedAt>`, so a new logo always gets a new URL;
 * a day of caching only delays a client that requests the bare path.
 */
const LOGO_CACHE_CONTROL = 'public, max-age=86400';

/** Public branding endpoints: no key required. */
@Controller('branding')
export class BrandingController {
  constructor(
    private readonly getBranding: GetBrandingUseCase,
    private readonly getLogo: GetLogoUseCase,
  ) {}

  @Get()
  async branding(): Promise<PublicBranding> {
    return toPublicBranding(respond(await this.getBranding.execute()));
  }

  @Get('logo')
  async logo(@Res() res: Response): Promise<void> {
    const logo = respond(await this.getLogo.execute());
    res.set({
      'Content-Type': logo.mimeType,
      'Cache-Control': LOGO_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(logo.data);
  }
}
