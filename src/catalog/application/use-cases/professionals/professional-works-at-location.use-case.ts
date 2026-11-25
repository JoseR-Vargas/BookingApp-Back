import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { NoActiveLocationError } from '../../../domain/catalog.errors';
import { locationIdsOf } from '../../../domain/professional.rules';
import { defaultLocationId } from '../../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';
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
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
  ) {}

  async execute(command: WorksAtLocationCommand): Promise<Result<boolean>> {
    const professional = await this.reader.findActive(command.professionalId);
    if (!professional) return ok(false);
    const defaultId = defaultLocationId(await this.locations.list());
    if (defaultId === null) return err(new NoActiveLocationError());
    return ok(
      locationIdsOf(professional, defaultId).includes(command.locationId),
    );
  }
}
