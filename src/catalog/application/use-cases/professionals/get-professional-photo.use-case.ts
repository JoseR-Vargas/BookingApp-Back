import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { PhotoNotFoundError } from '../../../domain/catalog.errors';
import { StoredPhoto } from '../../../domain/professional';
import {
  PROFESSIONAL_PHOTO_STORE,
  ProfessionalPhotoStore,
} from '../../ports/professional-photo.store';

/** The photo of a professional, active or not; Err when there is none. */
@Injectable()
export class GetProfessionalPhotoUseCase {
  constructor(
    @Inject(PROFESSIONAL_PHOTO_STORE)
    private readonly photos: ProfessionalPhotoStore,
  ) {}

  async execute(id: string): Promise<Result<StoredPhoto>> {
    const photo = await this.photos.findPhoto(id);
    return photo ? ok(photo) : err(new PhotoNotFoundError());
  }
}
