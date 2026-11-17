import { Body, Controller, Delete, Put, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { parseBrandingInput, parseLogoDataUrl } from './branding-validation';
import { BrandingService, PublicBranding } from './branding.service';

/** Branding configuration endpoints, all behind the admin key. */
@Controller('admin/branding')
@UseGuards(AdminKeyGuard)
export class BrandingAdminController {
  constructor(private readonly branding: BrandingService) {}

  @Put()
  saveBranding(@Body() body: unknown): Promise<PublicBranding> {
    return this.branding.saveBranding(parseBrandingInput(body));
  }

  @Put('logo')
  saveLogo(@Body() body: unknown): Promise<PublicBranding> {
    return this.branding.saveLogo(parseLogoDataUrl(body));
  }

  @Delete('logo')
  deleteLogo(): Promise<PublicBranding> {
    return this.branding.deleteLogo();
  }
}
