import { Inject, Injectable } from '@nestjs/common';
import { Result, err } from '../../../../shared/domain/result';
import { ProfessionalNotFoundError } from '../../../domain/catalog.errors';
import {
  ProfessionalInput,
  ensureActiveLocations,
  toProfessionalPatch,
} from '../../../domain/professional.rules';
import { activeLocationIds } from '../../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';
import {
  PROFESSIONAL_WRITER,
  ProfessionalWriter,
} from '../../ports/professional.writer';
import { ProfessionalView, viewOf } from './professional-view';

export interface UpdateProfessionalCommand {
  id: string;
  /** Already validated (see `validateProfessionalUpdate`). */
  patch: Partial<ProfessionalInput>;
}

/** Edits a professional: only the given fields change; given locations must be active. */
@Injectable()
export class UpdateProfessionalUseCase {
  constructor(
    @Inject(PROFESSIONAL_WRITER) private readonly writer: ProfessionalWriter,
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
  ) {}

  async execute(
    command: UpdateProfessionalCommand,
  ): Promise<Result<ProfessionalView>> {
    let locationIds: string[] | undefined;
    if (command.patch.locations) {
      const checked = ensureActiveLocations(
        command.patch.locations,
        activeLocationIds(await this.locations.list()),
      );
      if (!checked.ok) return checked;
      locationIds = checked.value;
    }
    const updated = await this.writer.update(
      command.id,
      toProfessionalPatch(command.patch, locationIds),
    );
    if (!updated) return err(new ProfessionalNotFoundError(command.id));
    return viewOf(updated, this.locations);
  }
}
