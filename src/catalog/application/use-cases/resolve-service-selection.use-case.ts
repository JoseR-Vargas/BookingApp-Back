import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { NoActiveLocationError } from '../../domain/catalog.errors';
import {
  SelectionLocation,
  ServiceSelection,
  buildServiceSelection,
  checkServiceIds,
  pickServices,
} from '../../domain/service-selection.rules';
import { defaultLocationId } from '../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../ports/location.reader';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../ports/professional.reader';
import { SERVICE_READER, ServiceReader } from '../ports/service.reader';

export interface ResolveServiceSelectionCommand {
  serviceIds: string[];
  /** Only the professionals assigned to this location are offered. */
  locationId?: string;
}

/**
 * Resolves service ids into a validated selection. Err(ServiceSelectionFailedError)
 * for an empty list, a duplicated id or an unknown (or inactive) id.
 */
@Injectable()
export class ResolveServiceSelectionUseCase {
  constructor(
    @Inject(SERVICE_READER) private readonly services: ServiceReader,
    @Inject(PROFESSIONAL_READER)
    private readonly professionals: ProfessionalReader,
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
  ) {}

  async execute(
    command: ResolveServiceSelectionCommand,
  ): Promise<Result<ServiceSelection>> {
    const ids = checkServiceIds(command.serviceIds);
    if (!ids.ok) return ids;
    const picked = pickServices(
      ids.value,
      await this.services.findActiveByIds(ids.value),
    );
    if (!picked.ok) return picked;

    const active = await this.professionals.list('active');
    let location: SelectionLocation | undefined;
    if (command.locationId !== undefined) {
      const defaultId = defaultLocationId(await this.locations.list());
      if (defaultId === null) return err(new NoActiveLocationError());
      location = {
        locationId: command.locationId,
        defaultLocationId: defaultId,
      };
    }
    return ok(buildServiceSelection(picked.value, active, location));
  }
}
