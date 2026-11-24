import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../../shared/application/clock.port';
import { Result, err } from '../../../../shared/domain/result';
import { ProfessionalNotFoundError } from '../../../domain/catalog.errors';
import { PhotoUpload } from '../../../domain/professional';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';
import {
  PROFESSIONAL_PHOTO_STORE,
  ProfessionalPhotoStore,
} from '../../ports/professional-photo.store';
import { ProfessionalView, viewOf } from './professional-view';

export interface SetProfessionalPhotoCommand {
  id: string;
  /** A validated image. */
  photo: PhotoUpload;
}

/** Replaces the photo of a professional, stamped with the current time. */
@Injectable()
export class SetProfessionalPhotoUseCase {
  constructor(
    @Inject(PROFESSIONAL_PHOTO_STORE)
    private readonly photos: ProfessionalPhotoStore,
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: SetProfessionalPhotoCommand,
  ): Promise<Result<ProfessionalView>> {
    const updated = await this.photos.savePhoto(command.id, {
      ...command.photo,
      updatedAt: this.clock.now(),
    });
    if (!updated) return err(new ProfessionalNotFoundError(command.id));
    return viewOf(updated, this.locations);
  }
}
