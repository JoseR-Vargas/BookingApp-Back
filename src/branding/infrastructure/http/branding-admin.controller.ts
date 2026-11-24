import { Body, Controller, Delete, Put, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { respond } from '../../../shared/infrastructure/http/respond';
import { DeleteLogoUseCase } from '../../application/use-cases/delete-logo.use-case';
import { SaveBrandingUseCase } from '../../application/use-cases/save-branding.use-case';
import { SaveLogoUseCase } from '../../application/use-cases/save-logo.use-case';
import { parseBrandingInput, parseLogoInput } from './branding.input';
import { PublicBranding, toPublicBranding } from './branding.presenter';

/** Branding configuration endpoints, all behind the admin key. */
@Controller('admin/branding')
@UseGuards(AdminKeyGuard)
export class BrandingAdminController {
  constructor(
    private readonly saveBranding: SaveBrandingUseCase,
    private readonly saveLogo: SaveLogoUseCase,
    private readonly deleteLogo: DeleteLogoUseCase,
  ) {}

  @Put()
  async putBranding(@Body() body: unknown): Promise<PublicBranding> {
    return toPublicBranding(
      respond(await this.saveBranding.execute(parseBrandingInput(body))),
    );
  }

  @Put('logo')
  async putLogo(@Body() body: unknown): Promise<PublicBranding> {
    return toPublicBranding(
      respond(await this.saveLogo.execute(parseLogoInput(body))),
    );
  }

  @Delete('logo')
  async removeLogo(): Promise<PublicBranding> {
    return toPublicBranding(respond(await this.deleteLogo.execute()));
  }
}
