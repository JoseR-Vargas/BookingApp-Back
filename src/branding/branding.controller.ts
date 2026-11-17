import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { Response } from 'express';
import { BrandingService, PublicBranding } from './branding.service';

/**
 * The logo URL carries `?v=<updatedAt>`, so a new logo always gets a new URL;
 * a day of caching only delays a client that requests the bare path.
 */
const LOGO_CACHE_CONTROL = 'public, max-age=86400';

/** Public branding endpoints: no key required. */
@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  getBranding(): Promise<PublicBranding> {
    return this.branding.getBranding();
  }

  @Get('logo')
  async getLogo(@Res() res: Response): Promise<void> {
    const logo = await this.branding.getLogo();
    if (!logo) {
      throw new NotFoundException('Logo not found');
    }
    res.set({
      'Content-Type': logo.mimeType,
      'Cache-Control': LOGO_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(logo.data);
  }
}
