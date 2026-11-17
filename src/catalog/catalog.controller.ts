import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { CatalogService } from './catalog.service';

/**
 * The photo URL carries `?v=<updatedAt>`, so a new photo always gets a new URL;
 * a day of caching only delays a client that requests the bare path.
 */
const PHOTO_CACHE_CONTROL = 'public, max-age=86400';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  getCatalog() {
    return this.catalogService.getCatalog();
  }

  /** Public; also serves the photo of inactive professionals. */
  @Get('professionals/:id/photo')
  async getProfessionalPhoto(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.catalogService.getProfessionalPhoto(id);
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }
    res.set({
      'Content-Type': photo.mimeType,
      'Cache-Control': PHOTO_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(photo.data);
  }
}
