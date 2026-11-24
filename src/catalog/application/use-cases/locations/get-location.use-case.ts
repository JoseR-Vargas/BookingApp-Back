import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { Location } from '../../../domain/location';
import { LocationNotFound } from '../../../domain/location.errors';
import {
  PRINCIPAL_LOCATION,
  activeLocations,
} from '../../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';

/**
 * An ACTIVE location by id; the default one (the oldest active) when `id` is
 * omitted. Err(LocationNotFound) for an unknown or inactive one, and, without
 * id, when none is active.
 */
@Injectable()
export class GetLocationUseCase {
  constructor(
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
  ) {}

  async execute(id?: string): Promise<Result<Location>> {
    const active = activeLocations(await this.locations.list());
    const found =
      id === undefined
        ? active[0]
        : active.find((location) => location.id === id);
    return found
      ? ok(found)
      : err(new LocationNotFound(id ?? PRINCIPAL_LOCATION.id));
  }
}
