import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { CLOCK, Clock } from '../../../../shared/application/clock.port';
import { NoActiveLocationError } from '../../../domain/catalog.errors';
import { PhotoUpload } from '../../../domain/professional';
import {
  ProfessionalInput,
  ensureActiveLocations,
  newProfessional,
} from '../../../domain/professional.rules';
import { slugCandidates, slugify } from '../../../domain/slug.rules';
import {
  BOOKING_ACTIVITY,
  BookingActivity,
} from '../../ports/booking-activity.port';
import {
  activeLocationIds,
  defaultLocationId,
} from '../../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';
import {
  PROFESSIONAL_WRITER,
  ProfessionalWriter,
} from '../../ports/professional.writer';
import { ProfessionalView } from './professional-view';

export interface CreateProfessionalCommand {
  /** Already validated (see `validateProfessionalCreate`). */
  input: ProfessionalInput;
  /** A validated image, stored in the same insert. */
  photo: PhotoUpload | null;
}

/**
 * Creates a professional under a slug of its name. Without `locations` it
 * works at the default location; given ones must all be active.
 */
@Injectable()
export class CreateProfessionalUseCase {
  constructor(
    @Inject(PROFESSIONAL_WRITER) private readonly writer: ProfessionalWriter,
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
    @Inject(BOOKING_ACTIVITY) private readonly activity: BookingActivity,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: CreateProfessionalCommand,
  ): Promise<Result<ProfessionalView>> {
    const { locations, ...fields } = command.input;
    const defaultId = defaultLocationId(await this.locations.list());
    if (defaultId === null) return err(new NoActiveLocationError());
    let locationIds = [defaultId];
    if (locations) {
      const checked = ensureActiveLocations(
        locations,
        activeLocationIds(await this.locations.list()),
      );
      if (!checked.ok) return checked;
      locationIds = checked.value;
    }
    const photo = command.photo
      ? { ...command.photo, updatedAt: this.clock.now() }
      : null;
    const professional = await this.writer.insert(
      this.unusedIds(slugify(fields.name, 'professional')),
      newProfessional(fields, locationIds, photo),
    );
    return ok({ professional, locationIds });
  }

  /**
   * The candidate ids no booking points at: the id of a deleted professional
   * is not handed to someone new while bookings cite it.
   */
  private async *unusedIds(base: string): AsyncGenerator<string> {
    for (const id of slugCandidates(base)) {
      if (!(await this.activity.hasAny(id))) yield id;
    }
  }
}
