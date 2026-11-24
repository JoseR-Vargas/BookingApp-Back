import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { respond } from '../../../shared/infrastructure/http/respond';
import { GetProfessionalPhotoUseCase } from '../../application/use-cases/professionals/get-professional-photo.use-case';

/**
 * The photo URL carries `?v=<updatedAt>`, so a new photo always gets a new URL;
 * a day of caching only delays a client that requests the bare path.
 */
const PHOTO_CACHE_CONTROL = 'public, max-age=86400';

/** Public photo endpoint: no key required; also serves inactive professionals. */
@Controller('catalog')
export class CatalogPhotoController {
  constructor(private readonly getPhoto: GetProfessionalPhotoUseCase) {}

  @Get('professionals/:id/photo')
  async photo(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const photo = respond(await this.getPhoto.execute(id));
    res.set({
      'Content-Type': photo.mimeType,
      'Cache-Control': PHOTO_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(photo.data);
  }
}
