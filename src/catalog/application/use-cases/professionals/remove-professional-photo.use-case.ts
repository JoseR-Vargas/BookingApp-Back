import { Inject, Injectable } from '@nestjs/common';
import { Result, err } from '../../../../shared/domain/result';
import { ProfessionalNotFoundError } from '../../../domain/catalog.errors';
import {
  LOCATION_DIRECTORY,
  LocationDirectory,
} from '../../ports/location-directory.port';
import {
  PROFESSIONAL_PHOTO_STORE,
  ProfessionalPhotoStore,
} from '../../ports/professional-photo.store';
import { ProfessionalView, viewOf } from './professional-view';

/** Removes the photo of a professional; the professional stays as it was. */
@Injectable()
export class RemoveProfessionalPhotoUseCase {
  constructor(
    @Inject(PROFESSIONAL_PHOTO_STORE)
    private readonly photos: ProfessionalPhotoStore,
    @Inject(LOCATION_DIRECTORY) private readonly locations: LocationDirectory,
  ) {}

  async execute(id: string): Promise<Result<ProfessionalView>> {
    const updated = await this.photos.removePhoto(id);
    if (!updated) return err(new ProfessionalNotFoundError(id));
    return viewOf(updated, this.locations);
  }
}
