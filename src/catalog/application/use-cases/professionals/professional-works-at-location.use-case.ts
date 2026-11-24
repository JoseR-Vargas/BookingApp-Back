import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { NoActiveLocationError } from '../../../domain/catalog.errors';
import { locationIdsOf } from '../../../domain/professional.rules';
import {
  LOCATION_DIRECTORY,
  LocationDirectory,
} from '../../ports/location-directory.port';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../../ports/professional.reader';

export interface WorksAtLocationCommand {
  professionalId: string;
  locationId: string;
}

/** Whether an ACTIVE professional works at the location (false for an unknown or inactive one). */
@Injectable()
export class ProfessionalWorksAtLocationUseCase {
  constructor(
    @Inject(PROFESSIONAL_READER) private readonly reader: ProfessionalReader,
    @Inject(LOCATION_DIRECTORY) private readonly locations: LocationDirectory,
  ) {}

  async execute(command: WorksAtLocationCommand): Promise<Result<boolean>> {
    const professional = await this.reader.findActive(command.professionalId);
    if (!professional) return ok(false);
    const defaultId = await this.locations.defaultId();
    if (defaultId === null) return err(new NoActiveLocationError());
    return ok(
      locationIdsOf(professional, defaultId).includes(command.locationId),
    );
  }
}
